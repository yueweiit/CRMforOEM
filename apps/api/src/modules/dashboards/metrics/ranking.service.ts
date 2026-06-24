import { Injectable } from "@nestjs/common";
import { CustomerStage } from "@prisma/client";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { between, formatBucket } from "../helpers/date-utils";
import { computePriority, HIGH_RISK_LEVELS, priorityRank, RISK_STAGES, type CustomerWhere, type DateRange } from "../types";

@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesRanking(user: RequestUser, customerWhere: CustomerWhere, range: DateRange) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        ...(user.dataScope === "TEAM" && user.teamId ? { teamId: user.teamId } : {}),
        isActive: true
      },
      select: { id: true, name: true }
    });

    const ranking = await Promise.all(users.map((owner) => this.getOwnerRanking(owner, customerWhere, range)));

    return ranking
      .filter((item) => item.customer_total || item.new_customers || item.sent_emails)
      .sort((a, b) => b.won_customers - a.won_customers || b.replied_customers - a.replied_customers || b.sent_emails - a.sent_emails);
  }

  private async getOwnerRanking(owner: { id: string; name: string }, customerWhere: CustomerWhere, range: DateRange) {
    const ownerCustomerWhere = { ...customerWhere, ownerId: owner.id };
    const [customerTotal, newCustomers, researched, sentEmails, repliedCustomerIds, quoted, samples, won] = await Promise.all([
      this.prisma.customer.count({ where: ownerCustomerWhere as never }),
      this.prisma.customer.count({ where: { ...ownerCustomerWhere, createdAt: between(range) } as never }),
      this.prisma.researchReport.findMany({
        where: { createdAt: between(range), customer: ownerCustomerWhere as never },
        distinct: ["customerId"], select: { customerId: true }
      }),
      this.prisma.emailMessage.count({
        where: {
          direction: "OUTBOUND", status: "SENT", sentAt: between(range),
          thread: { customer: ownerCustomerWhere as never }
        }
      }),
      this.getRepliedCustomerIds(ownerCustomerWhere, range),
      this.getDistinctCustomerIdsFromQuotes(ownerCustomerWhere, range),
      this.getDistinctCustomerIdsFromSamples(ownerCustomerWhere, range),
      this.prisma.customer.count({
        where: { ...ownerCustomerWhere, stage: CustomerStage.WON, updatedAt: between(range) } as never
      })
    ]);

    return {
      owner_id: owner.id, owner_name: owner.name,
      customer_total: customerTotal, new_customers: newCustomers,
      researched_customers: researched.length, sent_emails: sentEmails,
      replied_customers: repliedCustomerIds.length, quoted_customers: quoted.length,
      sample_customers: samples.length, won_customers: won,
      won_rate: sentEmails ? won / sentEmails : 0
    };
  }

  async getHighPriorityCustomers(customerWhere: CustomerWhere) {
    const customers = await this.prisma.customer.findMany({
      where: {
        ...customerWhere,
        stage: { notIn: [CustomerStage.BLACKLISTED, CustomerStage.INVALID, CustomerStage.WON] }
      } as never,
      take: 200, orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { id: true, name: true } },
        oemFitScores: { take: 1, orderBy: { createdAt: "desc" } },
        followUpTasks: { where: { status: "OPEN" }, take: 1, orderBy: { dueAt: "asc" } },
        quotes: { select: { amount: true }, take: 20 }
      }
    });

    return customers
      .map((customer) => {
        const latestScore = customer.oemFitScores[0];
        const quoteAmount = customer.quotes.reduce((sum, quote) => sum + Number(quote.amount), 0);
        const nextTaskDueAt = customer.followUpTasks[0]?.dueAt ?? null;
        const priority = computePriority(customer.stage, latestScore?.score ?? null, quoteAmount, nextTaskDueAt);
        return {
          id: customer.id, name: customer.name, country: customer.country,
          stage: customer.stage, owner_name: customer.owner?.name ?? "-",
          score: latestScore?.score ?? null, grade: latestScore?.grade ?? null,
          quote_amount: quoteAmount, next_task_due_at: nextTaskDueAt,
          updated_at: customer.updatedAt,
          priority_level: priority.level, priority_reason: priority.reason, priority_tags: priority.tags
        };
      })
      .filter((customer) => customer.priority_level !== "C")
      .sort(
        (a, b) =>
          priorityRank(a.priority_level) - priorityRank(b.priority_level) ||
          (b.score ?? -1) - (a.score ?? -1) ||
          b.quote_amount - a.quote_amount
      )
      .slice(0, 20);
  }

  getHighValueCustomers(customerWhere: CustomerWhere) {
    return this.getHighPriorityCustomers(customerWhere);
  }

  async getRiskCustomers(customerWhere: CustomerWhere) {
    const customers = await this.prisma.customer.findMany({
      where: customerWhere as never, take: 300, orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { name: true } },
        oemFitScores: { take: 1, orderBy: { createdAt: "desc" } },
        followUpTasks: { where: { status: "OPEN", dueAt: { lt: new Date() } }, select: { id: true } }
      }
    });

    return customers
      .map((customer) => {
        const latestScore = customer.oemFitScores[0];
        return {
          id: customer.id, name: customer.name, country: customer.country,
          stage: customer.stage, risk_level: customer.riskLevel,
          owner_name: customer.owner?.name ?? "-",
          score: latestScore?.score ?? null, overdue_tasks: customer.followUpTasks.length
        };
      })
      .filter(
        (customer) =>
          HIGH_RISK_LEVELS.includes(customer.risk_level) ||
          RISK_STAGES.includes(customer.stage) ||
          (customer.score !== null && customer.score < 40) ||
          customer.overdue_tasks > 0
      )
      .sort((a, b) => b.overdue_tasks - a.overdue_tasks || (a.score ?? 101) - (b.score ?? 101))
      .slice(0, 20);
  }

  async getProductLineFeedback(customerWhere: CustomerWhere, range: DateRange) {
    const analyses = await this.prisma.websiteAnalysis.findMany({
      where: { createdAt: between(range), customer: customerWhere as never },
      select: { productCategories: true }
    });

    const counts = new Map<string, number>();
    for (const analysis of analyses) {
      const categories = Array.isArray(analysis.productCategories) ? analysis.productCategories : [];
      const seenForCustomer = new Set<string>();
      for (const raw of categories) {
        const category = raw as { name?: unknown };
        const name = typeof category.name === "string" ? category.name.trim().toLowerCase() : "";
        if (!name || seenForCustomer.has(name)) continue;
        seenForCustomer.add(name);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([product_line, customer_count]) => ({ product_line, customer_count }))
      .sort((a, b) => b.customer_count - a.customer_count)
      .slice(0, 30);
  }

  // ── Shared query helpers ──

  async getSentCustomerIds(customerWhere: CustomerWhere, range: DateRange) {
    const rows = await this.prisma.emailThread.findMany({
      where: {
        customer: customerWhere as never,
        messages: { some: { direction: "OUTBOUND", status: "SENT", sentAt: between(range) } }
      },
      distinct: ["customerId"],
      select: { customerId: true }
    });
    return rows.map((row) => row.customerId);
  }

  async getRepliedCustomerIds(customerWhere: CustomerWhere, range: DateRange, sentCustomerIds?: string[]) {
    if (sentCustomerIds && sentCustomerIds.length === 0) return [];
    const rows = await this.prisma.emailThread.findMany({
      where: {
        customerId: sentCustomerIds?.length ? { in: sentCustomerIds } : undefined,
        customer: customerWhere as never,
        messages: { some: { direction: "INBOUND", receivedAt: between(range) } }
      },
      distinct: ["customerId"],
      select: { customerId: true }
    });
    return rows.map((row) => row.customerId);
  }

  async getDistinctCustomerIdsFromQuotes(customerWhere: CustomerWhere, range: DateRange) {
    const rows = await this.prisma.quote.findMany({
      where: { createdAt: between(range), customer: customerWhere as never },
      distinct: ["customerId"],
      select: { customerId: true }
    });
    return rows.map((row) => row.customerId);
  }

  async getDistinctCustomerIdsFromSamples(customerWhere: CustomerWhere, range: DateRange) {
    const rows = await this.prisma.sampleRequest.findMany({
      where: { createdAt: between(range), customer: customerWhere as never },
      distinct: ["customerId"],
      select: { customerId: true }
    });
    return rows.map((row) => row.customerId);
  }

  async getNewCustomerTrend(periodCustomerWhere: CustomerWhere, range: DateRange) {
    const customers = await this.prisma.customer.findMany({
      where: periodCustomerWhere as never,
      select: { createdAt: true }
    });
    const buckets = new Map<string, number>();
    for (const customer of customers) {
      const bucket = formatBucket(customer.createdAt, range.groupBy);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    return Array.from(buckets.entries())
      .map(([bucket, value]) => ({ bucket, value }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  async getEmailTrend(customerWhere: CustomerWhere, range: DateRange) {
    const messages = await this.prisma.emailMessage.findMany({
      where: {
        OR: [
          { direction: "OUTBOUND", status: "SENT", sentAt: between(range) },
          { direction: "INBOUND", receivedAt: between(range) }
        ],
        thread: { customer: customerWhere as never }
      },
      select: { direction: true, sentAt: true, receivedAt: true }
    });

    const buckets = new Map<string, { bucket: string; sent_message_count: number; replied_message_count: number }>();
    for (const message of messages) {
      const date = message.direction === "OUTBOUND" ? message.sentAt : message.receivedAt;
      if (!date) continue;
      const key = formatBucket(date, range.groupBy);
      const current = buckets.get(key) ?? { bucket: key, sent_message_count: 0, replied_message_count: 0 };
      if (message.direction === "OUTBOUND") current.sent_message_count += 1;
      if (message.direction === "INBOUND") current.replied_message_count += 1;
      buckets.set(key, current);
    }
    return Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }
}
