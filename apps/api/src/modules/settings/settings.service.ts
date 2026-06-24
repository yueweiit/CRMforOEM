import { Injectable } from "@nestjs/common";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { BlacklistService } from "./services/blacklist.service";
import { CustomerDictionaryService } from "./services/customer-dictionary.service";
import { EmailPromptConfigService } from "./services/email-prompt-config.service";
import { OrganizationQueryService } from "./services/organization-query.service";
import { RolePermissionService } from "./services/role-permission.service";
import { ScoringConfigService } from "./services/scoring-config.service";
import { UserManagementService } from "./services/user-management.service";
import type {
  CreateBlacklistRuleDto, CreateCustomerDictionaryDto, CreateUserDto,
  UpdateBlacklistRuleDto, UpdateCustomerDictionaryDto, UpdateEmailPromptConfigDto,
  UpdateOemScoringWeightsDto, UpdateRolePermissionsDto, UpdateUserDto
} from "./dto/settings.dto";
import type { EmailPromptConfigData } from "./prompts/settings-email-prompt.types";

@Injectable()
export class SettingsService {
  constructor(
    private readonly userManagement: UserManagementService,
    private readonly rolePermission: RolePermissionService,
    private readonly orgQuery: OrganizationQueryService,
    private readonly scoringConfig: ScoringConfigService,
    private readonly customerDictionary: CustomerDictionaryService,
    private readonly blacklist: BlacklistService,
    private readonly emailPromptConfig: EmailPromptConfigService
  ) {}

  // ── Users ──

  users(user: RequestUser) { return this.userManagement.listUsers(user); }
  createUser(user: RequestUser, dto: CreateUserDto) { return this.userManagement.createUser(user, dto); }
  updateUser(user: RequestUser, id: string, dto: UpdateUserDto) { return this.userManagement.updateUser(user, id, dto); }

  // ── Roles & Permissions ──

  roles(user: RequestUser) { return this.rolePermission.listRoles(user); }
  permissions(user: RequestUser) { return this.rolePermission.listPermissions(user); }
  updateRolePermissions(user: RequestUser, roleId: string, dto: UpdateRolePermissionsDto) { return this.rolePermission.updateRolePermissions(user, roleId, dto); }

  // ── Teams ──

  teams(user: RequestUser) { return this.orgQuery.listTeams(user); }

  // ── Audit Logs ──

  auditLogs(user: RequestUser) { return this.orgQuery.listAuditLogs(user); }

  // ── Customer Dictionaries ──

  customerSources(user: RequestUser) { return this.customerDictionary.listSources(user); }
  createCustomerSource(user: RequestUser, dto: CreateCustomerDictionaryDto) { return this.customerDictionary.createSource(user, dto); }
  updateCustomerSource(user: RequestUser, id: string, dto: UpdateCustomerDictionaryDto) { return this.customerDictionary.updateSource(user, id, dto); }
  customerTypes(user: RequestUser) { return this.customerDictionary.listTypes(user); }
  createCustomerType(user: RequestUser, dto: CreateCustomerDictionaryDto) { return this.customerDictionary.createType(user, dto); }
  updateCustomerType(user: RequestUser, id: string, dto: UpdateCustomerDictionaryDto) { return this.customerDictionary.updateType(user, id, dto); }

  // ── Blacklist ──

  blacklistRules(user: RequestUser) { return this.blacklist.list(user); }
  createBlacklistRule(user: RequestUser, dto: CreateBlacklistRuleDto) { return this.blacklist.create(user, dto); }
  updateBlacklistRule(user: RequestUser, id: string, dto: UpdateBlacklistRuleDto) { return this.blacklist.update(user, id, dto); }

  // ── OEM Scoring ──

  getOemScoringWeights(user: RequestUser) { return this.scoringConfig.getWeights(user); }
  updateOemScoringWeights(user: RequestUser, dto: UpdateOemScoringWeightsDto) { return this.scoringConfig.updateWeights(user, dto); }

  // ── Email Prompt Configs ──

  getEmailPromptConfigs(user: RequestUser) { return this.emailPromptConfig.getConfigs(user); }
  updateEmailPromptConfig(user: RequestUser, purpose: string, dto: UpdateEmailPromptConfigDto) { return this.emailPromptConfig.updateConfig(user, purpose, dto); }
  resetEmailPromptConfig(user: RequestUser, purpose: string) { return this.emailPromptConfig.resetConfig(user, purpose); }
  previewEmailPrompt(user: RequestUser, purpose: string, override?: UpdateEmailPromptConfigDto) { return this.emailPromptConfig.previewConfig(user, purpose, override); }
  readOrgPromptConfig(organizationId: string, purpose?: string | null): Promise<EmailPromptConfigData | null> { return this.emailPromptConfig.readOrgPromptConfig(organizationId, purpose); }
}
