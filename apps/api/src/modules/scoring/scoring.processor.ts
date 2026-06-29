import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { OEM_FIT_SCORE_QUEUE } from "./scoring.constants";
import { ScoringService } from "./scoring.service";

type OemFitScoreJob = {
  runId: string;
  organizationId: string;
  customerId: string;
  createdById?: string;
};

@Processor(OEM_FIT_SCORE_QUEUE)
export class ScoringProcessor extends WorkerHost {
  constructor(private readonly scoringService: ScoringService) {
    super();
  }

  process(job: Job<OemFitScoreJob>) {
    return this.scoringService.processQueuedRun(job.data);
  }
}
