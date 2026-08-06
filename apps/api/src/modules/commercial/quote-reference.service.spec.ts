import * as assert from "node:assert/strict";
import type { RequestUser } from "../../common/auth/current-user.decorator";
import { QuoteReferenceService } from "./quote-reference.service";

const user: RequestUser = {
  id: "user-1",
  organizationId: "org-1",
  roleCodes: [],
  permissions: ["quotes.read", "quotes.reference.read"],
  dataScope: "ALL"
};

function quote(id: string, status: "DRAFT" | "SENT" | "ACCEPTED", productName = "Widget") {
  return {
    id,
    customerId: "customer-1",
    quoteNo: `Q-${id}`,
    productName,
    specification: "White / 10 cm",
    moq: 100,
    quantity: 1000,
    unitPrice: { toString: () => "1.25" },
    currency: "USD",
    amount: { toString: () => "1250.00" },
    validUntil: new Date("2026-09-01T00:00:00.000Z"),
    status,
    approvalStatus: "APPROVED",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date(`2026-07-${id.padStart(2, "0")}T00:00:00.000Z`)
  };
}

async function main() {
  const selected = quote("01", "DRAFT");
  const candidates = [
    quote("02", "SENT"),
    quote("03", "ACCEPTED"),
    quote("04", "SENT", "Other"),
    quote("05", "SENT"),
    quote("06", "SENT"),
    quote("07", "SENT")
  ];
  let candidateWhere: Record<string, unknown> | undefined;
  const prisma = {
    quote: {
      findFirst: async () => selected,
      count: async () => 1,
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        candidateWhere = where;
        return candidates;
      }
    }
  };
  const service = new QuoteReferenceService(prisma as never);
  const result = await service.getReferenceContext(user, selected.id);

  assert.equal(result.selectedQuote.unitPrice, "1.25");
  assert.equal(result.historicalQuotes.length, 5);
  assert.equal(result.historicalQuotes[0].status, "ACCEPTED");
  assert.equal("materialCost" in result.selectedQuote, false);
  assert.deepEqual((candidateWhere?.customer as { organizationId: string }).organizationId, "org-1");

  const withoutHistoricalPermission = { ...user, permissions: ["quotes.read"] };
  const selectedOnly = await service.getReferenceContext(withoutHistoricalPermission, selected.id, { includeHistorical: false });
  assert.deepEqual(selectedOnly.historicalQuotes, []);

  await assert.rejects(
    () => service.getReferenceContext(withoutHistoricalPermission, selected.id),
    /permission to reference historical quotes/
  );

  console.log("quote-reference.service.spec.ts OK");
}

void main();
