import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CreateBlacklistRuleDto, CreateCustomerDictionaryDto, CreateUserDto, UpdateBlacklistRuleDto, UpdateCustomerDictionaryDto, UpdateUserDto } from "./dto/settings.dto";
import { SettingsService } from "./settings.service";

@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @RequirePermissions("settings.manage")
  @Get("settings/users")
  users(@CurrentUser() user: RequestUser) {
    return this.settingsService.users(user);
  }

  @RequirePermissions("settings.manage")
  @Post("settings/users")
  createUser(@CurrentUser() user: RequestUser, @Body() dto: CreateUserDto) {
    return this.settingsService.createUser(user, dto);
  }

  @RequirePermissions("settings.manage")
  @Patch("settings/users/:id")
  updateUser(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.settingsService.updateUser(user, id, dto);
  }

  @RequirePermissions("settings.manage")
  @Get("settings/roles")
  roles(@CurrentUser() user: RequestUser) {
    return this.settingsService.roles(user);
  }

  @RequirePermissions("settings.manage")
  @Get("settings/teams")
  teams(@CurrentUser() user: RequestUser) {
    return this.settingsService.teams(user);
  }

  @RequirePermissions("settings.manage")
  @Get("settings/audit-logs")
  auditLogs(@CurrentUser() user: RequestUser) {
    return this.settingsService.auditLogs(user);
  }

  @Get("settings/customer-sources")
  customerSources(@CurrentUser() user: RequestUser) {
    return this.settingsService.customerSources(user);
  }

  @Post("settings/customer-sources")
  createCustomerSource(@CurrentUser() user: RequestUser, @Body() dto: CreateCustomerDictionaryDto) {
    return this.settingsService.createCustomerSource(user, dto);
  }

  @Patch("settings/customer-sources/:id")
  updateCustomerSource(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateCustomerDictionaryDto) {
    return this.settingsService.updateCustomerSource(user, id, dto);
  }

  @Get("settings/customer-types")
  customerTypes(@CurrentUser() user: RequestUser) {
    return this.settingsService.customerTypes(user);
  }

  @Post("settings/customer-types")
  createCustomerType(@CurrentUser() user: RequestUser, @Body() dto: CreateCustomerDictionaryDto) {
    return this.settingsService.createCustomerType(user, dto);
  }

  @Patch("settings/customer-types/:id")
  updateCustomerType(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateCustomerDictionaryDto) {
    return this.settingsService.updateCustomerType(user, id, dto);
  }

  @Get("blacklist-rules")
  blacklistRules(@CurrentUser() user: RequestUser) {
    return this.settingsService.blacklistRules(user);
  }

  @Post("blacklist-rules")
  createBlacklistRule(@CurrentUser() user: RequestUser, @Body() dto: CreateBlacklistRuleDto) {
    return this.settingsService.createBlacklistRule(user, dto);
  }

  @Patch("blacklist-rules/:id")
  updateBlacklistRule(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateBlacklistRuleDto) {
    return this.settingsService.updateBlacklistRule(user, id, dto);
  }
}
