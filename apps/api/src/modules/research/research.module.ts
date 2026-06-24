import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { RESEARCH_REPORT_QUEUE } from "./research.constants";
import { ResearchController } from "./research.controller";
import { ResearchProcessor } from "./research.processor";
import { ResearchService } from "./research.service";
import { SearchProviderService } from "./services/search-provider.service";
import { ResearchContextBuilder } from "./builders/research-context-builder";
import { ResearchReportDataService } from "./services/research-report-data.service";
import { ResearchReportRunService } from "./services/research-report-run.service";

@Module({
  imports: [AiModule, BullModule.registerQueue({ name: RESEARCH_REPORT_QUEUE })],
  controllers: [ResearchController],
  providers: [ResearchService, ResearchProcessor, SearchProviderService, ResearchContextBuilder, ResearchReportDataService, ResearchReportRunService],
  exports: [ResearchService]
})
export class ResearchModule {}
