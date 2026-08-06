import "reflect-metadata";
import { strict as assert } from "node:assert";
import type { RequestUser } from "../../../common/auth/current-user.decorator";
import { QuoteWorkflowService } from "../../commercial/quote-workflow.service";
import { EmailApprovalService } from "./email-approval.service";

const user: RequestUser = {
  id: "user-1",
  organizationId: "org-1",
  name: "Sales User",
  roleCodes: ["SALES_REP"],
  permissions: ["emails.send", "quotes.send"],
  dataScope: "ALL"
};

const account = {
  id: "account-1",
  email: "sales@example.com",
  name: "Sales",
  hourlySendLimit: 20,
  dailySendLimit: 80,
  isActive: true,
  smtpHost: "smtp.example.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpUsername: "sales@example.com",
  smtpPasswordEncrypted: "encrypted"
};

const quoteUpdatedAt = new Date("2026-08-06T01:00:00.000Z");
const draft = {
  id: "draft-1",
  customerId: "customer-1",
  quoteId: "quote-1",
  quoteUpdatedAtSnapshot: quoteUpdatedAt,
  status: "APPROVED",
  toEmail: "buyer@example.net",
  ccEmails: [],
  bccEmails: [],
  subject: "Quotation Q-1",
  body: "Quotation body",
  purpose: "QUOTATION"
};

function buildHarness(options: { smtpFails?: boolean } = {}) {
  let quoteStatus = "DRAFT";
  let draftStatus = "APPROVED";
  let messageStatus = "";
  let dispatch: Record<string, any> | null = null;
  let smtpCalls = 0;
  const histories: Array<Record<string, unknown>> = [];
  const quote = {
    id: "quote-1",
    customerId: "customer-1",
    quoteNo: "Q-1",
    status: quoteStatus,
    approvalStatus: "APPROVED",
    sentAt: null,
    updatedAt: quoteUpdatedAt
  };

  const prisma: Record<string, any> = {
    quoteEmailDispatch: {
      findUnique: async () => dispatch ? { ...dispatch, emailMessage: dispatch.emailMessageId ? { id: dispatch.emailMessageId } : null } : null,
      create: async ({ data }: any) => {
        dispatch = { ...data };
        return dispatch;
      },
      update: async ({ data }: any) => {
        dispatch = { ...(dispatch ?? {}), ...data };
        return dispatch;
      }
    },
    emailThread: {
      create: async () => ({ id: "thread-1" })
    },
    emailMessage: {
      create: async ({ data }: any) => {
        messageStatus = data.status;
        return { id: "message-1", ...data };
      },
      update: async ({ data }: any) => {
        messageStatus = data.status;
        return { id: "message-1", ...data };
      }
    },
    emailDraft: {
      update: async ({ data }: any) => {
        draftStatus = data.status;
        return { ...draft, ...data };
      }
    },
    quote: {
      findUnique: async () => ({ ...quote, status: quoteStatus }),
      updateMany: async ({ data }: any) => {
        quoteStatus = data.status;
        return { count: 1 };
      }
    },
    quoteHistory: {
      create: async ({ data }: any) => {
        histories.push(data);
        return data;
      }
    }
  };
  prisma.$transaction = async (input: any) => typeof input === "function" ? input(prisma) : Promise.all(input);

  const compliance = {
    assertCanSend: async () => undefined,
    consumeQuota: async () => undefined
  };
  const smtp = {
    send: async (_account: unknown, _draft: unknown, sendOptions: { messageId?: string }) => {
      smtpCalls++;
      assert.match(sendOptions.messageId ?? "", /^<quote-.+@example\.com>$/);
      if (options.smtpFails) throw new Error("SMTP unavailable");
      return { messageId: sendOptions.messageId! };
    }
  };
  const service = new EmailApprovalService(
    prisma as never,
    {} as never,
    compliance as never,
    smtp as never,
    { advanceCustomerStage: async () => undefined } as never,
    { handleEmailSent: async () => undefined } as never,
    new QuoteWorkflowService()
  );

  return {
    service,
    state: () => ({ quoteStatus, draftStatus, messageStatus, dispatch, smtpCalls, histories })
  };
}

async function main() {
  const success = buildHarness();
  const first = await success.service.send(user, draft, account) as { quoteId?: string };
  assert.equal(first.quoteId, "quote-1");
  assert.equal(success.state().quoteStatus, "SENT");
  assert.equal(success.state().draftStatus, "SENT");
  assert.equal(success.state().messageStatus, "SENT");
  assert.equal(success.state().dispatch?.status, "SENT");
  assert.equal(success.state().histories[0]?.action, "SENT");

  const repeated = await success.service.send(user, draft, account) as { alreadySent?: boolean };
  assert.equal(repeated.alreadySent, true);
  assert.equal(success.state().smtpCalls, 1);

  const failed = buildHarness({ smtpFails: true });
  await assert.rejects(() => failed.service.send(user, draft, account), /SMTP unavailable/);
  assert.equal(failed.state().quoteStatus, "DRAFT");
  assert.equal(failed.state().draftStatus, "APPROVED");
  assert.equal(failed.state().messageStatus, "FAILED");
  assert.equal(failed.state().dispatch?.status, "FAILED");

  console.log("email-approval.service.spec.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
