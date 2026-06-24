import { Injectable } from "@nestjs/common";
import { CustomerStage } from "@prisma/client";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildDateRange } from "./helpers/date-utils";
import { DistributionService } from "./metrics/distribution.service";
import { RankingService } from "./metrics/ranking.service";
import { DashboardQueryBuilder } from "./services/dashboard-query-builder";
import { DashboardSummaryService } from "./services/dashboard-summary.service";
import type { DashboardQueryDto } from "./dto/dashboard-query.dto";

@Injectable()
export class DashboardsService {
  constructor(
    private readonly queryBuilder: DashboardQueryBuilder,
    private readonly distribution: DistributionService,
    private readonly ranking: RankingService,
    private readonly summary: DashboardSummaryService
  ) {}

  async personal(user: RequestUser, query: DashboardQueryDto) {
    const range = buildDateRange(query, "month");
    const customerWhere = await this.queryBuilder.buildCustomerWhere(user, query, "personal", false);
    const periodCustomerWhere = await this.queryBuilder.buildCustomerWhere(user, query, "personal", true, range);

    const [summary, stageDistribution, emailTrend, highPriorityCustomers, followupTasks] = await Promise.all([
      this.summary.getPersonalSummary(user, customerWhere, periodCustomerWhere, range),
      this.distribution.getStageDistribution(customerWhere),
      this.ranking.getEmailTrend(customerWhere, range),
      this.ranking.getHighPriorityCustomers(customerWhere),
      this.summary.getTodayFollowupTasks(user, customerWhere)
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
    const customerWhere = await this.queryBuilder.buildCustomerWhere(user, query, "team", false);
    const periodCustomerWhere = await this.queryBuilder.buildCustomerWhere(user, query, "team", true, range);
    return this.summary.getManagementLikeDashboard(user, customerWhere, periodCustomerWhere, range, "team");
  }

  async management(user: RequestUser, query: DashboardQueryDto) {
    const range = buildDateRange(query, "last30");
    const customerWhere = await this.queryBuilder.buildCustomerWhere(user, query, "management", false);
    const periodCustomerWhere = await this.queryBuilder.buildCustomerWhere(user, query, "management", true, range);
    return this.summary.getManagementLikeDashboard(user, customerWhere, periodCustomerWhere, range, "management");
  }

  async filterOptions(user: RequestUser) {
    const options = await this.queryBuilder.filterOptions(user);
    return { ...options, stages: Object.values(CustomerStage) };
  }
}
