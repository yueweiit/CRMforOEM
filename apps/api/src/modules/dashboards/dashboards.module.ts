import { Module } from "@nestjs/common";
import { DashboardsController } from "./dashboards.controller";
import { DashboardsService } from "./dashboards.service";
import { DistributionService } from "./metrics/distribution.service";
import { RankingService } from "./metrics/ranking.service";
import { DashboardQueryBuilder } from "./services/dashboard-query-builder";
import { DashboardSummaryService } from "./services/dashboard-summary.service";

@Module({
  controllers: [DashboardsController],
  providers: [
    DashboardsService,
    DashboardQueryBuilder,
    DistributionService,
    RankingService,
    DashboardSummaryService
  ]
})
export class DashboardsModule {}
