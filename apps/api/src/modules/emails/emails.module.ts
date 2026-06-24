import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { CustomersModule } from "../customers/customers.module";
import { FollowUpsModule } from "../follow-ups/follow-ups.module";
import { SettingsModule } from "../settings/settings.module";
import { EMAIL_DRAFT_QUEUE } from "./drafts/email-draft.constants";
import { EmailDraftProcessor } from "./drafts/email-draft.processor";
import { EmailApprovalService } from "./drafts/email-approval.service";
import { EmailDraftService } from "./drafts/email-draft.service";
import { EmailsController } from "./emails.controller";
import { EmailComplianceService } from "./accounts/email-compliance.service";
import { EmailSecretService } from "./accounts/email-secret.service";
import { EmailAccountService } from "./accounts/email-account.service";
import { EmailAccountListenerService } from "./accounts/email-account-listener.service";
import { EmailAccountTestService } from "./accounts/email-account-test.service";
import { EmailsService } from "./emails.service";
import { ImapIdleService } from "./inbound/imap-idle.service";
import { ImapConnectionRegistryService } from "./inbound/imap-connection-registry.service";
import { ImapFetchEnqueueService } from "./inbound/imap-fetch-enqueue.service";
import { ImapReconnectService } from "./inbound/imap-reconnect.service";
import { ImapManualSyncService } from "./inbound/imap-manual-sync.service";
import { ImapInboundProcessor } from "./inbound/imap-inbound.processor";
import { ImapInboundService } from "./inbound/imap-inbound.service";
import { ImapSyncService } from "./inbound/imap-sync.service";
import { EmailThreadService } from "./inbound/email-thread.service";
import { EmailContextBuilder } from "./generation/email-context-builder";
import { EmailDraftCreationService } from "./generation/email-draft-creation.service";
import { EmailDraftGenerationService } from "./generation/email-draft-generation.service";
import { EmailDraftSubmissionService } from "./generation/email-draft-submission.service";
import { SmtpService } from "./generation/smtp.service";
import { IMAP_INBOUND_QUEUE } from "./inbound/imap-inbound.constants";

@Module({
  imports: [
    AiModule,
    CustomersModule,
    FollowUpsModule,
    SettingsModule,
    BullModule.registerQueue({ name: EMAIL_DRAFT_QUEUE }),
    BullModule.registerQueue({ name: IMAP_INBOUND_QUEUE })
  ],
  controllers: [EmailsController],
  providers: [
    EmailsService,
    EmailAccountService,
    EmailAccountListenerService,
    EmailAccountTestService,
    EmailApprovalService,
    EmailDraftService,
    EmailContextBuilder,
    EmailDraftCreationService,
    EmailDraftGenerationService,
    EmailDraftSubmissionService,
    EmailThreadService,
    EmailComplianceService,
    EmailSecretService,
    SmtpService,
    ImapSyncService,
    ImapIdleService,
    ImapConnectionRegistryService,
    ImapFetchEnqueueService,
    ImapReconnectService,
    ImapManualSyncService,
    ImapInboundService,
    EmailDraftProcessor,
    ImapInboundProcessor
  ],
  exports: [EmailsService, ImapIdleService]
})
export class EmailsModule {}
