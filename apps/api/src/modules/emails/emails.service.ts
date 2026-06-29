import { Injectable } from "@nestjs/common";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { EmailAccountService } from "./accounts/email-account.service";
import { EmailDraftService } from "./drafts/email-draft.service";
import { EmailDraftGenerationService } from "./generation/email-draft-generation.service";
import { EmailThreadService } from "./inbound/email-thread.service";
import { ImapManualSyncService } from "./inbound/imap-manual-sync.service";
import type { ApproveEmailDraftDto } from "./dto/approve-email-draft.dto";
import type { CreateEmailAccountDto } from "./dto/create-email-account.dto";
import type { GenerateEmailDraftDto } from "./dto/generate-email-draft.dto";
import type { UpdateEmailAccountDto } from "./dto/update-email-account.dto";
import type { UpdateEmailDraftDto } from "./dto/update-email-draft.dto";

@Injectable()
export class EmailsService {
  constructor(
    private readonly accountService: EmailAccountService,
    private readonly draftGeneration: EmailDraftGenerationService,
    private readonly draftService: EmailDraftService,
    private readonly threads: EmailThreadService,
    private readonly manualSync: ImapManualSyncService
  ) {}

  // ── Account management ──

  listAccounts(user: RequestUser) { return this.accountService.list(user); }
  createAccount(user: RequestUser, dto: CreateEmailAccountDto) { return this.accountService.create(user, dto); }
  updateAccount(user: RequestUser, id: string, dto: UpdateEmailAccountDto) { return this.accountService.update(user, id, dto); }
  testAccount(user: RequestUser, id: string) { return this.accountService.test(user, id); }

  // ── Draft generation ──

  generateDraft(user: RequestUser, customerId: string, dto: GenerateEmailDraftDto) {
    return this.draftGeneration.generate(user, customerId, dto);
  }

  // ── Draft CRUD ──

  getDraft(user: RequestUser, id: string) { return this.draftService.getDraft(user, id); }
  updateDraft(user: RequestUser, id: string, dto: UpdateEmailDraftDto) { return this.draftService.updateDraft(user, id, dto); }
  submitReview(user: RequestUser, id: string) { return this.draftService.submitReview(user, id); }
  approve(user: RequestUser, id: string, dto: ApproveEmailDraftDto) { return this.draftService.approve(user, id, dto); }
  sendApprovedDraft(user: RequestUser, id: string) { return this.draftService.sendApprovedDraft(user, id); }

  // ── Thread queries ──

  listCustomerThreads(user: RequestUser, customerId: string) { return this.threads.listCustomerThreads(user, customerId); }
  listDrafts(user: RequestUser, filters: { customerId?: string; status?: string }) { return this.threads.listDrafts(user, filters); }
  listThreads(user: RequestUser) { return this.threads.listThreads(user); }
  listThreadMessages(user: RequestUser, threadId: string) { return this.threads.listThreadMessages(user, threadId); }

  // ── Sync ──

  syncStatus(user: RequestUser) { return this.manualSync.getConnectionStatusesForUser(user); }
  runSync(user: RequestUser) { return this.manualSync.manualSyncForUser(user); }
}
