import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { RequireLiveSession } from "../../common/auth/live-session.decorator";
import { RequireAnyPermissions } from "../../common/auth/permissions.decorator";
import { ApproveEmailDraftDto } from "./dto/approve-email-draft.dto";
import { CreateEmailAccountDto } from "./dto/create-email-account.dto";
import { GenerateEmailDraftDto } from "./dto/generate-email-draft.dto";
import { UpdateEmailAccountDto } from "./dto/update-email-account.dto";
import { UpdateEmailDraftDto } from "./dto/update-email-draft.dto";
import { ResolveQuoteReplyAssessmentDto } from "./dto/resolve-quote-reply-assessment.dto";
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
  @RequireAnyPermissions("emails.generate", "settings.manage")
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

  @Post("email-drafts/:id/attachments")
  @RequireLiveSession()
  @RequireAnyPermissions("emails.generate", "emails.send", "settings.manage")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  attachDraftFile(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("fileName") fileName?: string
  ) {
    return this.emailsService.attachDraftFile(user, id, file, fileName);
  }

  @Delete("email-drafts/:id/attachments/:attachmentId")
  @RequireLiveSession()
  @RequireAnyPermissions("emails.generate", "emails.send", "settings.manage")
  removeDraftFile(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string
  ) {
    return this.emailsService.removeDraftFile(user, id, attachmentId);
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

  @RequireAnyPermissions("quotes.read", "settings.manage")
  @Get("quote-reply-assessments")
  quoteReplyAssessments(
    @CurrentUser() user: RequestUser,
    @Query("customerId") customerId?: string,
    @Query("status") status?: string
  ) {
    return this.emailsService.listQuoteReplyAssessments(user, { customerId, status });
  }

  @RequireLiveSession()
  @RequireAnyPermissions("quotes.resolve_reply", "settings.manage")
  @Post("quote-reply-assessments/:id/confirm")
  confirmQuoteReplyAssessment(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: ResolveQuoteReplyAssessmentDto
  ) {
    return this.emailsService.confirmQuoteReplyAssessment(user, id, dto);
  }

  @RequireLiveSession()
  @RequireAnyPermissions("quotes.resolve_reply", "settings.manage")
  @Post("quote-reply-assessments/:id/dismiss")
  dismissQuoteReplyAssessment(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.emailsService.dismissQuoteReplyAssessment(user, id);
  }
}
