import { Injectable } from "@nestjs/common";
import { promises as dns } from "node:dns";
import * as nodemailer from "nodemailer";
import { EmailSecretService } from "./email-secret.service";

@Injectable()
export class SmtpService {
  constructor(private readonly secrets: EmailSecretService) {}

  async verify(account: SmtpAccount) {
    const transport = await this.createTransport(account);
    await transport.verify();
  }

  async send(account: SmtpAccount, draft: { subject: string; body: string; toEmail: string; ccEmails: string[]; bccEmails: string[] }) {
    const transport = await this.createTransport(account);
    const result = await transport.sendMail({
      from: account.email,
      to: draft.toEmail,
      cc: draft.ccEmails,
      bcc: draft.bccEmails,
      subject: draft.subject,
      text: draft.body
    });
    return { messageId: result.messageId };
  }

  private async createTransport(account: SmtpAccount) {
    const resolvedHost = await resolveSmtpHost(account.smtpHost);
    return nodemailer.createTransport({
      host: resolvedHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      logger: true,
      debug: true,
      tls: {
        servername: smtpServername(account)
      },
      auth: {
        user: account.smtpUsername,
        pass: this.secrets.decrypt(account.smtpPasswordEncrypted)
      }
    });
  }
}

type SmtpAccount = {
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPasswordEncrypted: string;
};

function smtpServername(account: SmtpAccount) {
  if (!isIpAddress(account.smtpHost)) return account.smtpHost;
  const domain = account.smtpUsername.split("@")[1]?.trim().toLowerCase();
  if (!domain) return undefined;
  return `smtp.${domain}`;
}

async function resolveSmtpHost(host: string) {
  if (isIpAddress(host)) return host;
  const result = await dns.lookup(host, { family: 4 });
  return result.address;
}

function isIpAddress(value: string) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value.trim());
}

