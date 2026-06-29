import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { OEM_FIT_SCORE_QUEUE } from "./scoring.constants";
import { ScoringController } from "./scoring.controller";
import { ScoringProcessor } from "./scoring.processor";
import { ScoringService } from "./scoring.service";

@Module({
  imports: [AiModule, BullModule.registerQueue({ name: OEM_FIT_SCORE_QUEUE })],
  controllers: [ScoringController],
  providers: [ScoringService, ScoringProcessor],
  exports: [ScoringService]
})
export class ScoringModule {}

