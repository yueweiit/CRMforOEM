import { Injectable } from "@nestjs/common";
import { SmtpService } from "../generation/smtp.service";
import { ImapSyncService } from "../inbound/imap-sync.service";
import { buildEmailTestSummary, mapImapTestError, mapSmtpTestError } from "./email-account-error-mapper";

type EmailAccountLike = {
  id: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPasswordEncrypted: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPasswordEncrypted: string;
};

@Injectable()
export class EmailAccountTestService {
  constructor(
    private readonly smtp: SmtpService,
    private readonly imapSync: ImapSyncService
  ) {}

  async test(account: EmailAccountLike) {
    const smtp = { ok: false, message: "SMTP 未测试。" };
    const imap = { ok: false, message: "IMAP 未测试。" };

    try {
      await this.smtp.verify(account);
      smtp.ok = true;
      smtp.message = "SMTP 连接正常。";
    } catch (error) {
      smtp.message = mapSmtpTestError(error);
    }
    try {
      await this.imapSync.verifyAccount(account);
      imap.ok = true;
      imap.message = "IMAP 连接正常。";
    } catch (error) {
      imap.message = mapImapTestError(error);
    }

    return { overallOk: smtp.ok && imap.ok, smtp, imap, message: buildEmailTestSummary(smtp, imap) };
  }
}
