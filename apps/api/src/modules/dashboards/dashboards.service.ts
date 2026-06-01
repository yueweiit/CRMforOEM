import { ForbiddenException, Injectable } from "@nestjs/common";
import { CustomerStage, RiskLevel } from "@prisma/client";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

type CustomerWhere = Record<string, unknown>;

type DateRange = {
  from: Date;
  to: Date;
  groupBy: "day" | "week" | "month";
};

const REPLIED_STAGES = [
  CustomerStage.REPLIED,
  CustomerStage.REQUIREMENT_CONFIRMING,
  CustomerStage.QUOTING,
  CustomerStage.SAMPLING,
  CustomerStage.NEGOTIATING,
  CustomerStage.WON
];

const SENT_STAGES = [
  CustomerStage.FIRST_EMAIL_SENT,
  CustomerStage.PENDING_SECOND_FOLLOW_UP,
  ...REPLIED_STAGES
];

const HIGH_VALUE_STAGES: CustomerStage[] = [CustomerStage.QUOTING, CustomerStage.SAMPLING, CustomerStage.NEGOTIATING, CustomerStage.WON];
const RISK_STAGES: CustomerStage[] = [CustomerStage.BLACKLISTED, CustomerStage.INVALID, CustomerStage.PAUSED];
const HIGH_RISK_LEVELS: RiskLevel[] = [RiskLevel.HIGH, RiskLevel.BLOCKED];

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async personal(user: RequestUser, query: DashboardQueryDto) {
    const range = buildDateRange(query, "month");
    const customerWhere = await this.buildCustomerWhere(user, query, "personal", false);
    const periodCustomerWhere = await this.buildCustomerWhere(user, query, "personal", true, range);

    const [summary, stageDistribution, emailTrend, highPriorityCustomers, followupTasks] = await Promise.all([
      this.getPersonalSummary(user, customerWhere, periodCustomerWhere, range),
      this.getStageDistribution(customerWhere),
      this.getEmailTrend(customerWhere, range),
      this.getHighPriorityCustomers(customerWhere),
      this.getTodayFollowupTasks(user, customerWhere)
    ]);

    return {
      summary,
      high_priority_customers: highPriorityCustomers,
      stage_distribution: stageDistribution,
      email_trend: emailTrend,
      followup_tasks: followupTasks
    };
  }

  async team(user: RequestUser, query: DashboardQueryDto) {
    const range = buildDateRange(query, "last30");
    const customerWhere = await this.buildCustomerWhere(user, query, "team", false);
    const periodCustomerWhere = await this.buildCustomerWhere(user, query, "team", true, range);
    return this.getManagementLikeDashboard(user, customerWhere, periodCustomerWhere, range, "team");
  }

  async management(user: RequestUser, query: DashboardQueryDto) {
    const range = buildDateRange(query, "last30");
    const customerWhere = await this.buildCustomerWhere(user, query, "management", false);
    const periodCustomerWhere = await this.buildCustomerWhere(user, query, "management", true, range);
    return this.getManagementLikeDashboard(user, customerWhere, periodCustomerWhere, range, "management");
  }

  async filterOptions(user: RequestUser) {
    const allowedTeamIds = await this.getAllowedTeamIds(user);
    const teamWhere =
      user.dataScope === "ALL"
        ? { organizationId: user.organizationId }
        : allowedTeamIds.length
          ? { organizationId: user.organizationId, id: { in: allowedTeamIds } }
          : { organizationId: user.organizationId, id: "__none__" };

    const userWhere =
      user.dataScope === "ALL"
        ? { organizationId: user.organizationId, isActive: true }
        : user.dataScope === "TEAM" && allowedTeamIds.length
          ? { organizationId: user.organizationId, teamId: { in: allowedTeamIds }, isActive: true }
          : { organizationId: user.organizationId, id: user.id, isActive: true };
    const countryScope = await this.buildCustomerWhere(
      user,
      {},
      user.dataScope === "ALL" ? "management" : user.dataScope === "TEAM" ? "team" : "personal",
      false
    );

    const [teams, users, countries, customerTypes] = await Promise.all([
      this.prisma.team.findMany({
        where: teamWhere,
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.user.findMany({
        where: userWhere,
        select: { id: true, name: true, teamId: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.customer.findMany({
        where: countryScope as never,
        distinct: ["country"],
        select: { country: true },
        orderBy: { country: "asc" }
      }),
      this.prisma.customerType.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      })
    ]);

    return {
      teams,
      users,
      countries: countries.map((item) => item.country).filter(Boolean),
      customer_types: customerTypes,
      stages: Object.values(CustomerStage)
    };
  }

  private async getPersonalSummary(
    user: RequestUser,
    customerWhere: CustomerWhere,
    periodCustomerWhere: CustomerWhere,
    range: DateRange
  ) {
    const sentCustomerIds = await this.getSentCustomerIds(periodCustomerWhere, range);
    const repliedCustomerIds = await this.getRepliedCustomerIds(periodCustomerWhere, range, sentCustomerIds);

    const [
      myCustomerTotal,
      todayPendingFollowups,
      monthNewCustomers,
      monthResearchedCustomers,
      monthSentEmails,
      monthQuotedCustomers,
      monthSampleCustomers,
      monthWonCustomers,
      overdueTasks
    ] = await Promise.all([
      this.prisma.customer.count({ where: customerWhere as never }),
      this.prisma.followUpTask.count({
        where: {
          ownerId: user.id,
          status: "OPEN",
          dueAt: { gte: startOfDay(new Date()), lt: addDays(startOfDay(new Date()), 1) },
          customer: customerWhere as never
        }
      }),
      this.prisma.customer.count({ where: periodCustomerWhere as never }),
      this.prisma.researchReport.findMany({
        where: { createdAt: between(range), customer: customerWhere as never },
        distinct: ["customerId"],
        select: { customerId: true }
      }),
      this.prisma.emailMessage.count({
        where: {
          direction: "OUTBOUND",
          status: "SENT",
          sentAt: between(range),
          thread: { customer: customerWhere as never }
        }
      }),
      this.prisma.quote.findMany({
        where: { createdAt: between(range), customer: customerWhere as never },
        distinct: ["customerId"],
        select: { customerId: true }
      }),
      this.prisma.sampleRequest.findMany({
        where: { createdAt: between(range), customer: customerWhere as never },
        distinct: ["customerId"],
        select: { customerId: true }
      }),
      this.prisma.customer.count({
        where: { ...customerWhere, stage: CustomerStage.WON, updatedAt: between(range) } as never
      }),
      this.prisma.followUpTask.count({
        where: {
          ownerId: user.id,
          status: "OPEN",
          dueAt: { lt: new Date() },
          customer: customerWhere as never
        }
      })
    ]);

    return {
      my_customer_total: myCustomerTotal,
      today_pending_followups: todayPendingFollowups,
      month_new_customers: monthNewCustomers,
      month_researched_customers: monthResearchedCustomers.length,
      month_sent_emails: monthSentEmails,
      month_replied_customers: repliedCustomerIds.length,
      month_reply_rate: sentCustomerIds.length ? repliedCustomerIds.length / sentCustomerIds.length : 0,
      month_quoted_customers: monthQuotedCustomers.length,
      month_sample_customers: monthSampleCustomers.length,
      month_won_customers: monthWonCustomers,
      overdue_tasks: overdueTasks,
      won_metric_source: "customer_stage_updated_at" as const,
      reply_metric_source: "email_thread_inbound_distinct_customer" as const,
      generated_at: new Date().toISOString()
    };
  }

  private async getManagementLikeDashboard(
    user: RequestUser,
    customerWhere: CustomerWhere,
    periodCustomerWhere: CustomerWhere,
    range: DateRange,
    scope: "team" | "management"
  ) {
    const [
      summary,
      newCustomerTrend,
      countryDistribution,
      typeDistribution,
      stageDistribution,
      salesRanking,
      highValueCustomers,
      riskCustomers,
      productLineFeedback
    ] = await Promise.all([
      this.getManagementSummary(customerWhere, periodCustomerWhere, range),
      this.getNewCustomerTrend(periodCustomerWhere, range),
      this.getCountryDistribution(customerWhere),
      this.getTypeDistribution(customerWhere),
      this.getStageDistribution(customerWhere),
      this.getSalesRanking(user, customerWhere, range),
      this.getHighValueCustomers(customerWhere),
      this.getRiskCustomers(customerWhere),
      this.getProductLineFeedback(customerWhere, range)
    ]);

    return {
      scope,
      summary,
      new_customer_trend: newCustomerTrend,
      country_distribution: countryDistribution,
      type_distribution: typeDistribution,
      stage_distribution: stageDistribution,
      sales_ranking: salesRanking,
      high_value_customers: highValueCustomers,
      risk_customers: riskCustomers,
      product_line_feedback: productLineFeedback
    };
  }

  private async getManagementSummary(customerWhere: CustomerWhere, periodCustomerWhere: CustomerWhere, range: DateRange) {
    const sentCustomerIds = await this.getSentCustomerIds(customerWhere, range);
    const repliedCustomerIds = await this.getRepliedCustomerIds(customerWhere, range, sentCustomerIds);
    const quotedCustomerIds = await this.getDistinctCustomerIdsFromQuotes(customerWhere, range);
    const sampleCustomerIds = await this.getDistinctCustomerIdsFromSamples(customerWhere, range);

    const [teamCustomerTotal, researchedCustomers, sentEmails, wonCustomers] = await Promise.all([
      this.prisma.customer.count({ where: customerWhere as never }),
      this.prisma.researchReport.findMany({
        where: { createdAt: between(range), customer: customerWhere as never },
        distinct: ["customerId"],
        select: { customerId: true }
      }),
      this.prisma.emailMessage.count({
        where: {
          direction: "OUTBOUND",
          status: "SENT",
          sentAt: between(range),
          thread: { customer: customerWhere as never }
        }
      }),
      this.prisma.customer.count({
        where: { ...periodCustomerWhere, stage: CustomerStage.WON } as never
      })
    ]);

    return {
      team_customer_total: teamCustomerTotal,
      researched_customers: researchedCustomers.length,
      sent_emails: sentEmails,
      reply_rate: sentCustomerIds.length ? repliedCustomerIds.length / sentCustomerIds.length : 0,
      quote_conversion_rate: repliedCustomerIds.length ? quotedCustomerIds.length / repliedCustomerIds.length : 0,
      sample_conversion_rate: quotedCustomerIds.length ? sampleCustomerIds.length / quotedCustomerIds.length : 0,
      won_conversion_rate: sentCustomerIds.length ? wonCustomers / sentCustomerIds.length : 0
    };
  }

  private async getSentCustomerIds(customerWhere: CustomerWhere, range: DateRange) {
    const rows = await this.prisma.emailThread.findMany({
      where: {
        customer: customerWhere as never,
        messages: {
          some: {
            direction: "OUTBOUND",
            status: "SENT",
            sentAt: between(range)
          }
        }
      },
      distinct: ["customerId"],
      select: { customerId: true }
    });
    return rows.map((row) => row.customerId);
  }

  private async getRepliedCustomerIds(customerWhere: CustomerWhere, range: DateRange, sentCustomerIds?: string[]) {
    if (sentCustomerIds && sentCustomerIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.emailThread.findMany({
      where: {
        customerId: sentCustomerIds?.length ? { in: sentCustomerIds } : undefined,
        customer: customerWhere as never,
        messages: {
          some: {
            direction: "INBOUND",
            receivedAt: between(range)
          }
        }
      },
      distinct: ["customerId"],
      select: { customerId: true }
    });
    return rows.map((row) => row.customerId);
  }

  private async getDistinctCustomerIdsFromQuotes(customerWhere: CustomerWhere, range: DateRange) {
    const rows = await this.prisma.quote.findMany({
      where: { createdAt: between(range), customer: customerWhere as never },
      distinct: ["customerId"],
      select: { customerId: true }
    });
    return rows.map((row) => row.customerId);
  }

  private async getDistinctCustomerIdsFromSamples(customerWhere: CustomerWhere, range: DateRange) {
    const rows = await this.prisma.sampleRequest.findMany({
      where: { createdAt: between(range), customer: customerWhere as never },
      distinct: ["customerId"],
      select: { customerId: true }
    });
    return rows.map((row) => row.customerId);
  }

  private async getStageDistribution(customerWhere: CustomerWhere) {
    const rows = await this.prisma.customer.groupBy({
      by: ["stage"],
      where: customerWhere as never,
      _count: { _all: true }
    });
    return rows.map((row) => ({ stage: row.stage, count: row._count._all }));
  }

  private async getCountryDistribution(customerWhere: CustomerWhere) {
    const rows = await this.prisma.customer.groupBy({
      by: ["country"],
      where: customerWhere as never,
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } }
    });
    return rows.map((row) => ({ country: row.country ?? "unknown", count: row._count._all }));
  }

  private async getTypeDistribution(customerWhere: CustomerWhere) {
    const customers = await this.prisma.customer.findMany({
      where: customerWhere as never,
      select: { type: { select: { id: true, name: true } } }
    });
    const counts = new Map<string, { customer_type_id: string | null; customer_type: string; count: number }>();
    for (const customer of customers) {
      const key = customer.type?.id ?? "unknown";
      const current = counts.get(key) ?? {
        customer_type_id: customer.type?.id ?? null,
        customer_type: customer.type?.name ?? "unknown",
        count: 0
      };
      current.count += 1;
      counts.set(key, current);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }

  private async getNewCustomerTrend(periodCustomerWhere: CustomerWhere, range: DateRange) {
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

  private async getEmailTrend(customerWhere: CustomerWhere, range: DateRange) {
    const messages = await this.prisma.emailMessage.findMany({
      where: {
        OR: [
          {
            direction: "OUTBOUND",
            status: "SENT",
            sentAt: between(range)
          },
          {
            direction: "INBOUND",
            receivedAt: between(range)
          }
        ],
        thread: { customer: customerWhere as never }
      },
      select: { direction: true, sentAt: true, receivedAt: true }
    });

    const buckets = new Map<string, {
      bucket: string;
      sent: number;
      replied: number;
      sent_message_count: number;
      replied_message_count: number;
    }>();
    for (const message of messages) {
      const date = message.direction === "OUTBOUND" ? message.sentAt : message.receivedAt;
      if (!date) continue;
      const key = formatBucket(date, range.groupBy);
      const current = buckets.get(key) ?? {
        bucket: key,
        sent: 0,
        replied: 0,
        sent_message_count: 0,
        replied_message_count: 0
      };
      if (message.direction === "OUTBOUND") {
        current.sent += 1;
        current.sent_message_count += 1;
      }
      if (message.direction === "INBOUND") {
        current.replied += 1;
        current.replied_message_count += 1;
      }
      buckets.set(key, current);
    }
    return Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  private async getSalesRanking(user: RequestUser, customerWhere: CustomerWhere, range: DateRange) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        ...(user.dataScope === "TEAM" && user.teamId ? { teamId: user.teamId } : {}),
        isActive: true
      },
      select: { id: true, name: true }
    });

    const ranking = await Promise.all(
      users.map(async (owner) => {
        const ownerCustomerWhere = { ...customerWhere, ownerId: owner.id };
        const [customerTotal, newCustomers, researched, sentEmails, repliedCustomerIds, quoted, samples, won] = await Promise.all([
          this.prisma.customer.count({ where: ownerCustomerWhere as never }),
          this.prisma.customer.count({ where: { ...ownerCustomerWhere, createdAt: between(range) } as never }),
          this.prisma.researchReport.findMany({
            where: { createdAt: between(range), customer: ownerCustomerWhere as never },
            distinct: ["customerId"],
            select: { customerId: true }
          }),
          this.prisma.emailMessage.count({
            where: {
              direction: "OUTBOUND",
              status: "SENT",
              sentAt: between(range),
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
          owner_id: owner.id,
          owner_name: owner.name,
          customer_total: customerTotal,
          new_customers: newCustomers,
          researched_customers: researched.length,
          sent_emails: sentEmails,
          replied_customers: repliedCustomerIds.length,
          quoted_customers: quoted.length,
          sample_customers: samples.length,
          won_customers: won,
          won_rate: sentEmails ? won / sentEmails : 0
        };
      })
    );

    return ranking
      .filter((item) => item.customer_total || item.new_customers || item.sent_emails)
      .sort((a, b) => b.won_customers - a.won_customers || b.replied_customers - a.replied_customers || b.sent_emails - a.sent_emails);
  }

  private async getHighPriorityCustomers(customerWhere: CustomerWhere) {
    const customers = await this.prisma.customer.findMany({
      where: {
        ...customerWhere,
        stage: { notIn: [CustomerStage.BLACKLISTED, CustomerStage.INVALID, CustomerStage.WON] }
      } as never,
      take: 200,
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { id: true, name: true } },
        oemFitScores: { take: 1, orderBy: { createdAt: "desc" } },
        followUpTasks: {
          where: { status: "OPEN" },
          take: 1,
          orderBy: { dueAt: "asc" }
        },
        quotes: { select: { amount: true }, take: 20 }
      }
    });

    return customers
      .map((customer) => {
        const latestScore = customer.oemFitScores[0];
        const quoteAmount = customer.quotes.reduce((sum, quote) => sum + Number(quote.amount), 0);
        const nextTaskDueAt = customer.followUpTasks[0]?.dueAt ?? null;
        const priority = computePriority(
          customer.stage,
          latestScore?.score ?? null,
          quoteAmount,
          nextTaskDueAt
        );
        return {
          id: customer.id,
          name: customer.name,
          country: customer.country,
          stage: customer.stage,
          owner_name: customer.owner?.name ?? "-",
          score: latestScore?.score ?? null,
          grade: latestScore?.grade ?? null,
          quote_amount: quoteAmount,
          next_task_due_at: nextTaskDueAt,
          updated_at: customer.updatedAt,
          priority_level: priority.level,
          priority_reason: priority.reason,
          priority_tags: priority.tags
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

  private getHighValueCustomers(customerWhere: CustomerWhere) {
    return this.getHighPriorityCustomers(customerWhere);
  }

  private async getRiskCustomers(customerWhere: CustomerWhere) {
    const customers = await this.prisma.customer.findMany({
      where: customerWhere as never,
      take: 300,
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { name: true } },
        oemFitScores: { take: 1, orderBy: { createdAt: "desc" } },
        followUpTasks: {
          where: {
            status: "OPEN",
            dueAt: { lt: new Date() }
          },
          select: { id: true }
        }
      }
    });

    return customers
      .map((customer) => {
        const latestScore = customer.oemFitScores[0];
        return {
          id: customer.id,
          name: customer.name,
          country: customer.country,
          stage: customer.stage,
          risk_level: customer.riskLevel,
          owner_name: customer.owner?.name ?? "-",
          score: latestScore?.score ?? null,
          overdue_tasks: customer.followUpTasks.length
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

  private async getProductLineFeedback(customerWhere: CustomerWhere, range: DateRange) {
    const analyses = await this.prisma.websiteAnalysis.findMany({
      where: {
        createdAt: between(range),
        customer: customerWhere as never
      },
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

  private async getTodayFollowupTasks(user: RequestUser, customerWhere: CustomerWhere) {
    const tasks = await this.prisma.followUpTask.findMany({
      where: {
        ownerId: user.id,
        status: "OPEN",
        dueAt: { gte: startOfDay(new Date()), lt: addDays(startOfDay(new Date()), 1) },
        customer: customerWhere as never
      },
      orderBy: { dueAt: "asc" },
      take: 10,
      include: {
        customer: { select: { id: true, name: true, stage: true } }
      }
    });

    const now = new Date();
    return tasks.map((task) => ({
      ...task,
      is_overdue: task.dueAt < now,
      task_type: task.type
    }));
  }

  private async buildCustomerWhere(
    user: RequestUser,
    query: DashboardQueryDto,
    mode: "personal" | "team" | "management",
    withCreatedRange: boolean,
    range?: DateRange
  ) {
    const where: CustomerWhere = {
      organizationId: user.organizationId
    };

    if (query.country) where.country = query.country;
    if (query.customerTypeId || query.customer_type_id) where.typeId = query.customerTypeId ?? query.customer_type_id;
    if (query.stage) where.stage = query.stage;
    if (withCreatedRange && range) where.createdAt = between(range);

    if (mode === "personal" || user.dataScope === "SELF") {
      where.ownerId = user.id;
      return where;
    }

    const requestedOwnerId = query.ownerId ?? query.owner_id;
    const requestedTeamId = query.teamId ?? query.team_id;

    if (mode === "team" && user.dataScope === "ALL") {
      if (requestedTeamId) where.owner = { teamId: requestedTeamId };
      if (requestedOwnerId) where.ownerId = requestedOwnerId;
      return where;
    }

    if (mode === "team" || user.dataScope === "TEAM") {
      if (!user.teamId) {
        where.ownerId = user.id;
        return where;
      }
      const allowedTeamIds = await this.getAllowedTeamIds(user);
      if (requestedTeamId && !allowedTeamIds.includes(requestedTeamId)) {
        throw new ForbiddenException("Cannot access another team's dashboard");
      }
      where.owner = { teamId: { in: requestedTeamId ? [requestedTeamId] : allowedTeamIds } };
      if (requestedOwnerId) where.ownerId = requestedOwnerId;
      return where;
    }

    if (mode === "management") {
      if (requestedOwnerId) where.ownerId = requestedOwnerId;
      if (requestedTeamId) where.owner = { teamId: requestedTeamId };
    }

    return where;
  }

  private async getAllowedTeamIds(user: RequestUser) {
    if (user.dataScope === "ALL") {
      return [];
    }
    if (user.dataScope !== "TEAM" || !user.teamId) {
      return user.teamId ? [user.teamId] : [];
    }

    const teams = await this.prisma.team.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, parentId: true }
    });
    const childIdsByParent = new Map<string, string[]>();
    for (const team of teams) {
      if (!team.parentId) continue;
      const children = childIdsByParent.get(team.parentId) ?? [];
      children.push(team.id);
      childIdsByParent.set(team.parentId, children);
    }

    const result = new Set<string>([user.teamId]);
    const queue = [user.teamId];
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      for (const childId of childIdsByParent.get(current) ?? []) {
        if (result.has(childId)) continue;
        result.add(childId);
        queue.push(childId);
      }
    }
    return Array.from(result);
  }
}

function buildDateRange(query: DashboardQueryDto, defaultMode: "month" | "last30"): DateRange {
  const now = new Date();
  const defaultFrom = defaultMode === "month" ? startOfMonth(now) : addDays(startOfDay(now), -29);
  const from = query.from ? startOfDay(new Date(query.from)) : defaultFrom;
  const to = query.to ? endOfDay(new Date(query.to)) : endOfDay(now);
  const groupBy = query.groupBy ?? query.group_by ?? inferGroupBy(from, to);
  return { from, to, groupBy };
}

function between(range: DateRange) {
  return { gte: range.from, lte: range.to };
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function inferGroupBy(from: Date, to: Date): "day" | "week" | "month" {
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
  if (days <= 60) return "day";
  if (days <= 180) return "week";
  return "month";
}

function formatBucket(date: Date, groupBy: "day" | "week" | "month") {
  const value = new Date(date);
  if (groupBy === "month") {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }
  if (groupBy === "week") {
    const weekStart = startOfDay(value);
    weekStart.setDate(value.getDate() - value.getDay());
    return weekStart.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function computePriority(
  stage: CustomerStage,
  score: number | null,
  quoteAmount: number,
  nextTaskDueAt: Date | null
): { level: "A" | "B" | "C"; reason: string; tags: string[] } {
  const now = new Date();
  const threeDays = new Date(now.getTime() + 3 * 86_400_000);
  const sevenDays = new Date(now.getTime() + 7 * 86_400_000);

  const reasons: string[] = [];
  const tags: string[] = [];

  // A-level
  const isNegotiating = stage === CustomerStage.NEGOTIATING;
  const hasHighScore = score !== null && score >= 80;
  const hasQuoteAndUrgent =
    quoteAmount > 0 && nextTaskDueAt !== null && nextTaskDueAt <= threeDays;

  if (isNegotiating) {
    reasons.push("处于订单谈判阶段");
    tags.push("谈判中");
  }
  if (hasHighScore) {
    reasons.push(`OEM 评分 ${score} 分`);
    tags.push("高评分");
  }
  if (hasQuoteAndUrgent) {
    reasons.push("有报价且任务临期");
    tags.push("报价中");
    tags.push("任务临期");
  }

  if (isNegotiating || hasHighScore || hasQuoteAndUrgent) {
    return { level: "A", reason: reasons.join("，"), tags };
  }

  // B-level
  const isQuotingOrSampling =
    stage === CustomerStage.QUOTING || stage === CustomerStage.SAMPLING;
  const hasMediumScore = score !== null && score >= 60 && score < 80;
  const hasTaskSoon = nextTaskDueAt !== null && nextTaskDueAt <= sevenDays;

  if (isQuotingOrSampling) {
    reasons.push(
      stage === CustomerStage.QUOTING ? "处于报价阶段" : "处于样品阶段"
    );
    tags.push(stage === CustomerStage.QUOTING ? "报价中" : "样品中");
  }
  if (hasMediumScore) {
    reasons.push(`OEM 评分 ${score} 分`);
    tags.push("中等评分");
  }
  if (hasTaskSoon) {
    reasons.push("7 天内有跟进任务");
    tags.push("任务临期");
  }

  if (isQuotingOrSampling || hasMediumScore || hasTaskSoon) {
    return { level: "B", reason: reasons.join("，"), tags };
  }

  // C-level
  return { level: "C", reason: "常规推进客户", tags: ["常规推进"] };
}

function priorityRank(level: string): number {
  if (level === "A") return 0;
  if (level === "B") return 1;
  return 2;
}
