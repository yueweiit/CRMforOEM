import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuditCleanupService } from "./audit-cleanup.service";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SettingsController],
  providers: [SettingsService, AuditCleanupService]
})
export class SettingsModule {}
