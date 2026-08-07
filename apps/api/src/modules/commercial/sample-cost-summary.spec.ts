import * as assert from "node:assert/strict";
import { buildSampleCostSummary } from "./sample-cost-summary";

const result = buildSampleCostSummary(
  [
    { sampleRoundId: "r1", amount: "100", currency: "usd", costNature: "ACTUAL_COST", paymentStatus: "NOT_APPLICABLE" },
    { sampleRoundId: "r2", amount: 40, currency: "USD", costNature: "ACTUAL_COST", paymentStatus: "NOT_APPLICABLE" },
    { sampleRoundId: null, amount: 20, currency: "USD", costNature: "CUSTOMER_CHARGE", paymentStatus: "RECEIVED" },
    { sampleRoundId: "r2", amount: 10, currency: "EUR", costNature: "ACTUAL_COST", paymentStatus: "NOT_APPLICABLE" }
  ],
  [{ id: "r1", roundNo: 1 }, { id: "r2", roundNo: 2 }]
);

assert.deepEqual(result.byCurrency, [
  { currency: "EUR", firstRoundCost: 0, resampleCost: 10, totalActualCost: 10, customerCharge: 0, receivedAmount: 0, companyBorneAmount: 10 },
  { currency: "USD", firstRoundCost: 100, resampleCost: 40, totalActualCost: 140, customerCharge: 20, receivedAmount: 20, companyBorneAmount: 120 }
]);
assert.equal(result.byRound.find((item) => item.roundId === "r2")?.currencies[0].resampleCost, 40);
assert.equal(result.byRound.find((item) => item.roundId === null)?.currencies[0].receivedAmount, 20);

console.log("sample-cost-summary assertions passed");
