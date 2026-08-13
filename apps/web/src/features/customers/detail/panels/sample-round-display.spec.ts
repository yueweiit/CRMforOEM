import * as assert from "node:assert/strict";
import { sampleRoundDisplayStatus } from "./sample-round-display";

const cases = [
  [{ status: "COMPLETED", feedbackResult: "ACCEPTED", dispositionStatus: "RETURNED" }, "PASSED"],
  [{ status: "COMPLETED", feedbackResult: null, dispositionStatus: "RETURNED" }, "RETURNED"],
  [{ status: "COMPLETED", feedbackResult: null, dispositionStatus: "CUSTOMER_KEPT" }, "CUSTOMER_KEPT"],
  [{ status: "COMPLETED", feedbackResult: null, dispositionStatus: "DISPOSED" }, "DISPOSED"],
  [{ status: "FEEDBACK_RECEIVED", feedbackResult: "CUSTOMER_REJECTED", dispositionStatus: "PENDING" }, "PENDING_DISPOSITION"],
  [{ status: "COMPLETED", feedbackResult: null, dispositionStatus: "PENDING" }, null]
] as const;

for (const [round, expected] of cases) {
assert.equal(sampleRoundDisplayStatus(round), expected);
}

console.log("sample-round-display.spec.ts OK");
