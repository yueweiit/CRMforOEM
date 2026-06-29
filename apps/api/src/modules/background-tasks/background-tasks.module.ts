import { Global, Module } from "@nestjs/common";
import { BackgroundTaskStaleService } from "./background-task-stale.service";
import { BackgroundTasksController } from "./background-tasks.controller";
import { BackgroundTasksService } from "./background-tasks.service";
import { TaskSubmissionLockService } from "./task-submission-lock.service";

@Global()
@Module({
  controllers: [BackgroundTasksController],
  providers: [BackgroundTasksService, BackgroundTaskStaleService, TaskSubmissionLockService],
  exports: [BackgroundTaskStaleService, TaskSubmissionLockService]
})
export class BackgroundTasksModule {}
