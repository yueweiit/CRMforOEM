import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { RequireLiveSession } from "../../common/auth/live-session.decorator";
import { RequireAnyPermissions } from "../../common/auth/permissions.decorator";
import { ApproveEmailDraftDto } from "./dto/approve-email-draft.dto";
import { CreateEmailAccountDto } from "./dto/create-email-account.dto";
import { GenerateEmailDraftDto } from "./dto/generate-email-draft.dto";
import { UpdateEmailAccountDto } from "./dto/update-email-account.dto";
import { UpdateEmailDraftDto } from "./dto/update-email-draft.dto";
import { EmailsService } from "./emails.service";

@Controller()
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Get("email-accounts")
  accounts(@CurrentUser() user: RequestUser) {
    return this.emailsService.listAccounts(user);
  }

  // Controller only performs coarse permission checks.
  // Personal/shared account ownership is enforced in EmailsService.
  @RequireLiveSession()
  @RequireAnyPermissions("emails.accounts.manage_personal", "emails.accounts.manage_shared", "settings.manage")
  @Post("email-accounts")
  createAccount(@CurrentUser() user: RequestUser, @Body() dto: CreateEmailAccountDto) {
    return this.emailsService.createAccount(user, dto);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("emails.accounts.manage_personal", "emails.accounts.manage_shared", "settings.manage")
  @Patch("email-accounts/:id")
  updateAccount(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateEmailAccountDto) {
    return this.emailsService.updateAccount(user, id, dto);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("emails.accounts.manage_personal", "emails.accounts.manage_shared", "settings.manage")
  @Post("email-accounts/:id/test")
  testAccount(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.emailsService.testAccount(user, id);
  }

  @Post("customers/:customerId/email-drafts/generate")
  generateDraft(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Body() dto: GenerateEmailDraftDto
  ) {
    return this.emailsService.generateDraft(user, customerId, dto);
  }

  @Get("email-drafts/:id")
  getDraft(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.emailsService.getDraft(user, id);
  }

  @Get("email-drafts")
  async drafts(@CurrentUser() user: RequestUser, @Query("customerId") customerId?: string, @Query("status") status?: string) {
    const page = await this.emailsService.listDrafts(user, { customerId, status, limit: 100 });
    return page.items;
  }

  @Get("customers/:customerId/email-drafts")
  customerDrafts(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Query("purpose") purpose?: string,
    @Query("status") status?: string,
    @Query("recipient") recipient?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
  ) {
    return this.emailsService.listDrafts(user, { customerId, purpose, status, recipient, cursor, limit });
  }

  @Patch("email-drafts/:id")
  updateDraft(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateEmailDraftDto) {
    return this.emailsService.updateDraft(user, id, dto);
  }

  @Post("email-drafts/:id/submit-review")
  submitReview(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.emailsService.submitReview(user, id);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("emails.send", "emails.approve", "settings.manage")
  @Post("email-drafts/:id/approve")
  approve(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: ApproveEmailDraftDto) {
    return this.emailsService.approve(user, id, dto);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("emails.send", "settings.manage")
  @Post("email-drafts/:id/send")
  send(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.emailsService.sendApprovedDraft(user, id);
  }

  @Get("customers/:customerId/email-threads")
  threads(@CurrentUser() user: RequestUser, @Param("customerId") customerId: string) {
    return this.emailsService.listCustomerThreads(user, customerId);
  }

  @Get("email-threads")
  allThreads(@CurrentUser() user: RequestUser) {
    return this.emailsService.listThreads(user);
  }

  @Get("email-threads/:id/messages")
  messages(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.emailsService.listThreadMessages(user, id);
  }

  @Get("email-sync/status")
  syncStatus(@CurrentUser() user: RequestUser) {
    return this.emailsService.syncStatus(user);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("emails.accounts.manage_personal", "emails.accounts.manage_shared", "settings.manage")
  @Post("email-sync/run")
  runSync(@CurrentUser() user: RequestUser) {
    return this.emailsService.runSync(user);
  }
}
