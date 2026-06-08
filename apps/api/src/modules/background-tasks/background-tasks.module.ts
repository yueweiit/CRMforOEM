import { Global, Module } from "@nestjs/common";
import { BackgroundTasksController } from "./background-tasks.controller";
import { BackgroundTasksService } from "./background-tasks.service";
import { TaskSubmissionLockService } from "./task-submission-lock.service";

@Global()
@Module({
  controllers: [BackgroundTasksController],
  providers: [BackgroundTasksService, TaskSubmissionLockService],
  exports: [TaskSubmissionLockService]
})
export class BackgroundTasksModule {}
