import * as assert from "node:assert/strict";
import { composeGeneratedEmailBody } from "./quotation-email";
import type { EmailGenerationContext } from "./types";

function main() {
  const context = {
    purpose: "QUOTATION",
    intendedRecipient: { email: "buyer@example.com" },
    responsibleOwner: null,
    customer: { name: "Buyer" },
    customerInsights: {},
    ourCompany: null,
    quotation: {
      selectedQuote: {
        id: "quote-1",
        quoteNo: "Q-100",
        productName: "Bottle",
        specification: "500 ml",
        moq: 100,
        quantity: 500,
        unitPrice: "9.80",
        currency: "USD",
        amount: "4900.00",
        validUntil: "2026-09-01T00:00:00.000Z",
        status: "DRAFT",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      },
      historicalQuotes: []
    }
  } satisfies EmailGenerationContext;

  const body = composeGeneratedEmailBody("Thank you for your interest.", context);
  assert.ok(body.startsWith("Thank you for your interest."));
  assert.ok(body.includes("Quote no.: Q-100"));
  assert.ok(body.includes("Unit price: USD 9.80"));
  assert.ok(body.includes("Total amount: USD 4900.00"));
  assert.ok(body.includes("Valid until: 2026-09-01"));

  console.log("quotation-email.spec.ts OK");
}

main();
