import { Injectable } from "@nestjs/common";
import { ImapIdleService } from "../inbound/imap-idle.service";

type ImapAccountLike = {
  id: string;
  isActive: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPasswordEncrypted: string;
  user: { organizationId: string };
};

@Injectable()
export class EmailAccountListenerService {
  constructor(private readonly imapIdle: ImapIdleService) {}

  async startAfterCreate(account: ImapAccountLike) {
    await this.imapIdle.startAccount(account).catch((error) => {
      console.error(
        `[EmailAccount] Failed to start IMAP listener for ${account.id}:`,
        error instanceof Error ? error.message : "Unknown error"
      );
    });
  }

  async refreshAfterUpdate(
    previous: { isActive: boolean },
    updated: ImapAccountLike,
    dto: { imapHost?: string; imapPort?: number; imapSecure?: boolean; imapUsername?: string; imapPassword?: string; email?: string }
  ) {
    const connectionChanged = Boolean(
      dto.imapHost || dto.imapPort || dto.imapSecure !== undefined ||
      dto.imapUsername || dto.imapPassword || dto.email
    );
    if (!updated.isActive) {
      await this.imapIdle.stopAccount(updated.id);
      return;
    }
    if (!previous.isActive || connectionChanged) {
      await this.imapIdle.startAccount(updated).catch((error) => {
        console.error(
          `[EmailAccount] Failed to refresh IMAP listener for ${updated.id}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      });
    }
  }
}
