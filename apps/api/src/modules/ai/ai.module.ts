import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiGenerationService } from "./ai-generation.service";
import { AiProviderService } from "./ai-provider.service";
import { AiBudgetService } from "./ai-budget.service";
import { AiRetryService } from "./ai-retry.service";
import { AiJsonGuard } from "./ai-json-guard";
import { AiTextCompressor } from "./ai-text-compressor";
import { AiBatchPlanner } from "./ai-batch-planner";
import { AiSummaryMerger } from "./ai-summary-merger";
import { AiSummaryCache } from "./services/ai-summary-cache.service";

const aiSummaryCacheProvider = {
  provide: AiSummaryCache,
  useFactory: () => new AiSummaryCache()
};

@Module({
  controllers: [AiController],
  providers: [
    AiGenerationService,
    AiProviderService,
    AiBudgetService,
    AiRetryService,
    AiJsonGuard,
    AiTextCompressor,
    AiBatchPlanner,
    AiSummaryMerger,
    aiSummaryCacheProvider
  ],
  exports: [
    AiGenerationService,
    AiProviderService,
    AiBudgetService,
    AiRetryService,
    AiJsonGuard,
    AiTextCompressor,
    AiBatchPlanner,
    AiSummaryMerger,
    AiSummaryCache
  ]
})
export class AiModule {}

