import { Injectable } from "@nestjs/common";
import { CustomerStage } from "@prisma/client";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { addDays, between, startOfDay } from "../helpers/date-utils";
import { DistributionService } from "../metrics/distribution.service";
import { RankingService } from "../metrics/ranking.service";
import type { CustomerWhere, DateRange } from "../types";

@Injectable()
export class DashboardSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly distribution: DistributionService,
    private readonly ranking: RankingService
  ) {}

  async getManagementLikeDashboard(
    user: RequestUser,
    customerWhere: CustomerWhere,
    periodCustomerWhere: CustomerWhere,
    range: DateRange,
    scope: "team" | "management"
  ) {
    const [
      summary, newCustomerTrend, countryDistribution, typeDistribution,
      stageDistribution, salesRanking, highValueCustomers, riskCustomers, productLineFeedback
    ] = await Promise.all([
      this.getManagementSummary(customerWhere, periodCustomerWhere, range),
      this.ranking.getNewCustomerTrend(periodCustomerWhere, range),
      this.distribution.getCountryDistribution(customerWhere),
      this.distribution.getTypeDistribution(customerWhere),
      this.distribution.getStageDistribution(customerWhere),
      this.ranking.getSalesRanking(user, customerWhere, range),
      this.ranking.getHighValueCustomers(customerWhere),
      this.ranking.getRiskCustomers(customerWhere),
      this.ranking.getProductLineFeedback(customerWhere, range)
    ]);

    return {
      scope, summary,
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

  async getPersonalSummary(
    user: RequestUser,
    customerWhere: CustomerWhere,
    periodCustomerWhere: CustomerWhere,
    range: DateRange
  ) {
    const sentCustomerIds = await this.ranking.getSentCustomerIds(periodCustomerWhere, range);
    const repliedCustomerIds = await this.ranking.getRepliedCustomerIds(periodCustomerWhere, range, sentCustomerIds);

    const [myCustomerTotal, todayPendingFollowups, monthNewCustomers, monthResearchedCustomers,
      monthSentEmails, monthQuotedCustomers, monthSampleCustomers, monthWonCustomers, overdueTasks
    ] = await this.getPersonalMetrics(user, customerWhere, periodCustomerWhere, range);

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

  private getPersonalMetrics(
    user: RequestUser,
    customerWhere: CustomerWhere,
    periodCustomerWhere: CustomerWhere,
    range: DateRange
  ) {
    return Promise.all([
      this.prisma.customer.count({ where: customerWhere as never }),
      this.prisma.followUpTask.count({
        where: {
          ...this.buildFollowupOwnerWhere(user),
          status: "OPEN",
          dueAt: { gte: startOfDay(new Date()), lt: addDays(startOfDay(new Date()), 1) },
          customer: customerWhere as never
        }
      }),
      this.prisma.customer.count({ where: periodCustomerWhere as never }),
      this.prisma.researchReport.findMany({
        where: { createdAt: between(range), customer: customerWhere as never },
        distinct: ["customerId"], select: { customerId: true }
      }),
      this.prisma.emailMessage.count({
        where: {
          direction: "OUTBOUND", status: "SENT", sentAt: between(range),
          thread: { customer: customerWhere as never }
        }
      }),
      this.prisma.quote.findMany({
        where: { createdAt: between(range), customer: customerWhere as never },
        distinct: ["customerId"], select: { customerId: true }
      }),
      this.prisma.sampleRequest.findMany({
        where: { createdAt: between(range), customer: customerWhere as never },
        distinct: ["customerId"], select: { customerId: true }
      }),
      this.prisma.customer.count({
        where: { ...customerWhere, stage: CustomerStage.WON, updatedAt: between(range) } as never
      }),
      this.prisma.followUpTask.count({
        where: {
          ...this.buildFollowupOwnerWhere(user),
          status: "OPEN", dueAt: { lt: new Date() },
          customer: customerWhere as never
        }
      })
    ]);
  }

  async getManagementSummary(customerWhere: CustomerWhere, periodCustomerWhere: CustomerWhere, range: DateRange) {
    const sentCustomerIds = await this.ranking.getSentCustomerIds(customerWhere, range);
    const repliedCustomerIds = await this.ranking.getRepliedCustomerIds(customerWhere, range, sentCustomerIds);
    const quotedCustomerIds = await this.ranking.getDistinctCustomerIdsFromQuotes(customerWhere, range);
    const sampleCustomerIds = await this.ranking.getDistinctCustomerIdsFromSamples(customerWhere, range);

    const [teamCustomerTotal, researchedCustomers, sentEmails, wonCustomers] = await Promise.all([
      this.prisma.customer.count({ where: customerWhere as never }),
      this.prisma.researchReport.findMany({
        where: { createdAt: between(range), customer: customerWhere as never },
        distinct: ["customerId"], select: { customerId: true }
      }),
      this.prisma.emailMessage.count({
        where: { direction: "OUTBOUND", status: "SENT", sentAt: between(range), thread: { customer: customerWhere as never } }
      }),
      this.prisma.customer.count({ where: { ...periodCustomerWhere, stage: CustomerStage.WON } as never })
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

  async getTodayFollowupTasks(user: RequestUser, customerWhere: CustomerWhere) {
    const tasks = await this.prisma.followUpTask.findMany({
      where: {
        ...this.buildFollowupOwnerWhere(user),
        status: "OPEN",
        dueAt: { gte: startOfDay(new Date()), lt: addDays(startOfDay(new Date()), 1) },
        customer: customerWhere as never
      },
      orderBy: { dueAt: "asc" }, take: 10,
      include: { customer: { select: { id: true, name: true, stage: true } } }
    });

    const now = new Date();
    return tasks.map((task) => ({ ...task, is_overdue: task.dueAt < now, task_type: task.type }));
  }

  private buildFollowupOwnerWhere(user: RequestUser) {
    return user.dataScope === "ALL" ? {} : { ownerId: user.id };
  }
}
