import * as assert from "node:assert/strict";
import { QuoteWorkflowService } from "./quote-workflow.service";

async function main() {
  const service = new QuoteWorkflowService();
  let quote = {
    id: "quote-1",
    status: "DRAFT",
    approvalStatus: "APPROVED",
    sentAt: null as Date | null,
    quoteNo: "Q-1"
  };
  const actions: string[] = [];
  const tx = {
    quote: {
      updateMany: async ({ where, data }: { where: { status?: string | { in: string[] }; approvalStatus?: string }; data: Record<string, unknown> }) => {
        const statuses = typeof where.status === "object" ? where.status.in : [where.status];
        if ((statuses[0] && !statuses.includes(quote.status)) || (where.approvalStatus && where.approvalStatus !== quote.approvalStatus)) {
          return { count: 0 };
        }
        quote = { ...quote, ...data } as typeof quote;
        return { count: 1 };
      },
      findUnique: async () => quote
    },
    quoteHistory: {
      create: async ({ data }: { data: { action: string } }) => {
        actions.push(data.action);
        return { id: `history-${actions.length}` };
      }
    }
  };

  const sent = await service.markSent(tx as never, {
    quote,
    actor: { id: "user-1", name: "Tester" }
  });
  assert.equal(sent.status, "SENT");
  assert.ok(sent.sentAt instanceof Date);
  assert.deepEqual(actions, ["SENT"]);

  const rejected = await service.resolveCustomerReply(tx as never, {
    quote: sent,
    outcome: "CUSTOMER_REJECTED",
    actor: { id: "user-1", name: "Tester" }
  });
  assert.equal(rejected.status, "CUSTOMER_REJECTED");
  assert.deepEqual(actions, ["SENT", "CUSTOMER_REJECTED"]);

  await assert.rejects(
    () => service.resolveCustomerReply(tx as never, {
      quote: rejected,
      outcome: "ACCEPTED",
      actor: { id: "user-1", name: "Tester" }
    }),
    /Only sent quotes/
  );

  await assert.rejects(
    () => service.resolveCustomerReply(tx as never, {
      quote: { ...rejected, status: "SENT" },
      outcome: "ACCEPTED",
      actor: { id: "user-2", name: "Concurrent reviewer" }
    }),
    /already been resolved/
  );

  assert.throws(
    () => service.assertSendable({ status: "DRAFT", approvalStatus: "PENDING_APPROVAL" }),
    /Only approved quotes/
  );

  console.log("quote-workflow.service.spec.ts OK");
}

void main();
