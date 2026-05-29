import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { ApproveEmailDraftDto } from "./dto/approve-email-draft.dto";
import { CreateEmailAccountDto } from "./dto/create-email-account.dto";
import { GenerateEmailDraftDto } from "./dto/generate-email-draft.dto";
import { UpdateEmailAccountDto } from "./dto/update-email-account.dto";
import { UpdateEmailDraftDto } from "./dto/update-email-draft.dto";
import { EmailsService } from "./emails.service";
import { ImapIdleService } from "./imap-idle.service";

@Controller()
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly imapIdleService: ImapIdleService
  ) {}

  @Get("email-accounts")
  accounts(@CurrentUser() user: RequestUser) {
    return this.emailsService.listAccounts(user);
  }

  @Post("email-accounts")
  createAccount(@CurrentUser() user: RequestUser, @Body() dto: CreateEmailAccountDto) {
    return this.emailsService.createAccount(user, dto);
  }

  @Patch("email-accounts/:id")
  updateAccount(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateEmailAccountDto) {
    return this.emailsService.updateAccount(user, id, dto);
  }

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
  drafts(@CurrentUser() user: RequestUser, @Query("customerId") customerId?: string, @Query("status") status?: string) {
    return this.emailsService.listDrafts(user, { customerId, status });
  }

  @Get("customers/:customerId/email-drafts")
  customerDrafts(@CurrentUser() user: RequestUser, @Param("customerId") customerId: string) {
    return this.emailsService.listDrafts(user, { customerId });
  }

  @Patch("email-drafts/:id")
  updateDraft(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateEmailDraftDto) {
    return this.emailsService.updateDraft(user, id, dto);
  }

  @Post("email-drafts/:id/submit-review")
  submitReview(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.emailsService.submitReview(user, id);
  }

  @Post("email-drafts/:id/approve")
  approve(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: ApproveEmailDraftDto) {
    return this.emailsService.approve(user, id, dto);
  }

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

  @Post("email-sync/run")
  runSync(@CurrentUser() user: RequestUser) {
    return this.imapIdleService.manualSyncForUser(user.id);
  }
}
