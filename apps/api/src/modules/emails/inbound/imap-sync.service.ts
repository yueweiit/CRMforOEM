import { Injectable } from "@nestjs/common";
import { ImapFlow } from "imapflow";
import { EmailSecretService } from "../accounts/email-secret.service";

type EmailAccountLike = {
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPasswordEncrypted: string;
};

@Injectable()
export class ImapSyncService {
  constructor(private readonly secrets: EmailSecretService) {}

  async verifyAccount(account: EmailAccountLike) {
    const client = this.createClient(account);
    await client.connect();
    try {
      return { ok: true };
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  private createClient(account: EmailAccountLike) {
    return new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth: {
        user: account.imapUsername,
        pass: this.secrets.decrypt(account.imapPasswordEncrypted)
      }
    });
  }
}
