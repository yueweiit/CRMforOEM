import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { CustomersModule } from "../customers/customers.module";
import { FollowUpsModule } from "../follow-ups/follow-ups.module";
import { EMAIL_DRAFT_QUEUE } from "./email-draft.constants";
import { EmailDraftProcessor } from "./email-draft.processor";
import { EmailsController } from "./emails.controller";
import { EmailComplianceService } from "./email-compliance.service";
import { EmailSecretService } from "./email-secret.service";
import { EmailsService } from "./emails.service";
import { ImapIdleService } from "./imap-idle.service";
import { ImapInboundProcessor } from "./imap-inbound.processor";
import { ImapInboundService } from "./imap-inbound.service";
import { ImapSyncService } from "./imap-sync.service";
import { SmtpService } from "./smtp.service";
import { IMAP_INBOUND_QUEUE } from "./imap-inbound.constants";

@Module({
  imports: [
    AiModule,
    CustomersModule,
    FollowUpsModule,
    BullModule.registerQueue({ name: EMAIL_DRAFT_QUEUE }),
    BullModule.registerQueue({ name: IMAP_INBOUND_QUEUE })
  ],
  controllers: [EmailsController],
  providers: [
    EmailsService,
    EmailComplianceService,
    EmailSecretService,
    SmtpService,
    ImapSyncService,
    ImapIdleService,
    ImapInboundService,
    EmailDraftProcessor,
    ImapInboundProcessor
  ],
  exports: [EmailsService, ImapIdleService]
})
export class EmailsModule {}
