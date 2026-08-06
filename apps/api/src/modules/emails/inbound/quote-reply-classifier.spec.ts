import * as assert from "node:assert/strict";
import {
  buildQuoteReplyClassificationPrompt,
  parseQuoteReplyClassification
} from "./quote-reply-classifier";

function main() {
  const reply = "We accept quotation Q-100. Please proceed.";
  assert.deepEqual(
    parseQuoteReplyClassification(JSON.stringify({
      intent: "ACCEPT",
      confidence: 0.96,
      evidence: "We accept quotation Q-100.",
      reason: "Explicit acceptance"
    }), reply),
    {
      intent: "ACCEPT",
      confidence: 0.96,
      evidence: "We accept quotation Q-100.",
      reason: "Explicit acceptance"
    }
  );

  assert.equal(
    parseQuoteReplyClassification(JSON.stringify({
      intent: "ACCEPT",
      confidence: 0.99,
      evidence: "Acceptance not present in the email",
      reason: "Unsupported"
    }), reply).intent,
    "UNCERTAIN"
  );
  assert.equal(parseQuoteReplyClassification("not json", reply).intent, "UNCERTAIN");
  assert.equal(parseQuoteReplyClassification('{"intent":"NEGOTIATE","confidence":2}', "Can you reduce the price?").confidence, 1);

  const prompt = buildQuoteReplyClassificationPrompt({
    quoteNo: "Q-100",
    productName: "Bottle",
    currency: "USD",
    amount: "1000.00",
    replyText: "Can you reduce the price?"
  });
  assert.ok(prompt.system.includes("partial acceptance is NEGOTIATE"));
  assert.ok(prompt.user.includes("Q-100"));

  console.log("quote-reply-classifier.spec.ts OK");
}

main();
