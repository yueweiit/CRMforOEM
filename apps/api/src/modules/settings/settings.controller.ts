import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { RequireLiveSession } from "../../common/auth/live-session.decorator";
import { RequireAnyPermissions, RequirePermissions } from "../../common/auth/permissions.decorator";
import { CreateBlacklistRuleDto, CreateCustomerDictionaryDto, CreateUserDto, UpdateBlacklistRuleDto, UpdateCustomerDictionaryDto, UpdateEmailPromptConfigDto, UpdateOemScoringWeightsDto, UpdateRolePermissionsDto, UpdateUserDto } from "./dto/settings.dto";
import { SettingsService } from "./settings.service";

@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ── Users ──

  @RequireAnyPermissions("settings.users.manage", "settings.manage")
  @Get("settings/users")
  users(@CurrentUser() user: RequestUser) {
    return this.settingsService.users(user);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("settings.users.manage", "settings.manage")
  @Post("settings/users")
  createUser(@CurrentUser() user: RequestUser, @Body() dto: CreateUserDto) {
    return this.settingsService.createUser(user, dto);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("settings.users.manage", "settings.manage")
  @Patch("settings/users/:id")
  updateUser(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.settingsService.updateUser(user, id, dto);
  }

  // ── Roles & Permissions ──

  @RequireAnyPermissions("settings.roles.manage", "settings.manage")
  @Get("settings/roles")
  roles(@CurrentUser() user: RequestUser) {
    return this.settingsService.roles(user);
  }

  @RequireAnyPermissions("settings.roles.manage", "settings.manage")
  @Get("settings/permissions")
  permissions(@CurrentUser() user: RequestUser) {
    return this.settingsService.permissions(user);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("settings.roles.manage", "settings.manage")
  @Patch("settings/roles/:roleId/permissions")
  updateRolePermissions(@CurrentUser() user: RequestUser, @Param("roleId") roleId: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.settingsService.updateRolePermissions(user, roleId, dto);
  }

  // ── Teams ──

  @RequireAnyPermissions("settings.users.manage", "settings.manage")
  @Get("settings/teams")
  teams(@CurrentUser() user: RequestUser) {
    return this.settingsService.teams(user);
  }

  // ── Audit Logs ──

  @RequireAnyPermissions("settings.audit_logs.read", "settings.manage")
  @Get("settings/audit-logs")
  auditLogs(@CurrentUser() user: RequestUser) {
    return this.settingsService.auditLogs(user);
  }

  // ── Customer Dictionaries ──

  @RequireAnyPermissions("settings.customer_dictionaries.manage", "settings.manage")
  @Get("settings/customer-sources")
  customerSources(@CurrentUser() user: RequestUser) {
    return this.settingsService.customerSources(user);
  }

  @RequireAnyPermissions("settings.customer_dictionaries.manage", "settings.manage")
  @Post("settings/customer-sources")
  createCustomerSource(@CurrentUser() user: RequestUser, @Body() dto: CreateCustomerDictionaryDto) {
    return this.settingsService.createCustomerSource(user, dto);
  }

  @RequireAnyPermissions("settings.customer_dictionaries.manage", "settings.manage")
  @Patch("settings/customer-sources/:id")
  updateCustomerSource(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateCustomerDictionaryDto) {
    return this.settingsService.updateCustomerSource(user, id, dto);
  }

  @RequireAnyPermissions("settings.customer_dictionaries.manage", "settings.manage")
  @Get("settings/customer-types")
  customerTypes(@CurrentUser() user: RequestUser) {
    return this.settingsService.customerTypes(user);
  }

  @RequireAnyPermissions("settings.customer_dictionaries.manage", "settings.manage")
  @Post("settings/customer-types")
  createCustomerType(@CurrentUser() user: RequestUser, @Body() dto: CreateCustomerDictionaryDto) {
    return this.settingsService.createCustomerType(user, dto);
  }

  @RequireAnyPermissions("settings.customer_dictionaries.manage", "settings.manage")
  @Patch("settings/customer-types/:id")
  updateCustomerType(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateCustomerDictionaryDto) {
    return this.settingsService.updateCustomerType(user, id, dto);
  }

  // ── Blacklist ──

  @RequireAnyPermissions("settings.blacklist.manage", "settings.manage")
  @Get("blacklist-rules")
  blacklistRules(@CurrentUser() user: RequestUser) {
    return this.settingsService.blacklistRules(user);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("settings.blacklist.manage", "settings.manage")
  @Post("blacklist-rules")
  createBlacklistRule(@CurrentUser() user: RequestUser, @Body() dto: CreateBlacklistRuleDto) {
    return this.settingsService.createBlacklistRule(user, dto);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("settings.blacklist.manage", "settings.manage")
  @Patch("blacklist-rules/:id")
  updateBlacklistRule(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateBlacklistRuleDto) {
    return this.settingsService.updateBlacklistRule(user, id, dto);
  }

  // ── OEM Scoring ──

  @RequireAnyPermissions("settings.scoring_weights.manage", "settings.manage")
  @Get("settings/oem-scoring-weights")
  getOemScoringWeights(@CurrentUser() user: RequestUser) {
    return this.settingsService.getOemScoringWeights(user);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("settings.scoring_weights.manage", "settings.manage")
  @Patch("settings/oem-scoring-weights")
  updateOemScoringWeights(@CurrentUser() user: RequestUser, @Body() dto: UpdateOemScoringWeightsDto) {
    return this.settingsService.updateOemScoringWeights(user, dto);
  }

  // ── Email Prompt Configs ──

  @RequireAnyPermissions("settings.email_prompt.manage", "settings.manage")
  @Get("settings/email-prompt-configs")
  getEmailPromptConfigs(@CurrentUser() user: RequestUser) {
    return this.settingsService.getEmailPromptConfigs(user);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("settings.email_prompt.manage", "settings.manage")
  @Patch("settings/email-prompt-configs/:purpose")
  updateEmailPromptConfig(@CurrentUser() user: RequestUser, @Param("purpose") purpose: string, @Body() dto: UpdateEmailPromptConfigDto) {
    return this.settingsService.updateEmailPromptConfig(user, purpose, dto);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("settings.email_prompt.manage", "settings.manage")
  @Post("settings/email-prompt-configs/:purpose/reset")
  resetEmailPromptConfig(@CurrentUser() user: RequestUser, @Param("purpose") purpose: string) {
    return this.settingsService.resetEmailPromptConfig(user, purpose);
  }

  @RequireAnyPermissions("settings.email_prompt.manage", "settings.manage")
  @Post("settings/email-prompt-configs/:purpose/preview")
  previewEmailPrompt(@CurrentUser() user: RequestUser, @Param("purpose") purpose: string, @Body() dto?: UpdateEmailPromptConfigDto) {
    return this.settingsService.previewEmailPrompt(user, purpose, dto);
  }
}
