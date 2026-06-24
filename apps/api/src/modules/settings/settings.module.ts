import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuditCleanupService } from "./audit-cleanup.service";
import { PermissionService } from "./permission.service";
import { BlacklistService } from "./services/blacklist.service";
import { CustomerDictionaryService } from "./services/customer-dictionary.service";
import { EmailPromptConfigService } from "./services/email-prompt-config.service";
import { OrganizationQueryService } from "./services/organization-query.service";
import { RolePermissionService } from "./services/role-permission.service";
import { ScoringConfigService } from "./services/scoring-config.service";
import { UserManagementService } from "./services/user-management.service";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    AuditCleanupService,
    PermissionService,
    UserManagementService,
    RolePermissionService,
    OrganizationQueryService,
    ScoringConfigService,
    CustomerDictionaryService,
    BlacklistService,
    EmailPromptConfigService
  ],
  exports: [PermissionService, SettingsService]
})
export class SettingsModule {}
