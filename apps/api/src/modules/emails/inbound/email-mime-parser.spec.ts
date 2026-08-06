import * as assert from "node:assert/strict";
import {
  extractLatestReply,
  MAX_INBOUND_SOURCE_BYTES,
  MAX_REPLY_CLASSIFICATION_CHARS,
  parseInboundMime
} from "./email-mime-parser";

async function main() {
  const mime = Buffer.from([
    "From: buyer@example.com",
    "To: sales@example.com",
    "Subject: Re: Quote Q-100",
    "Message-ID: <reply@example.com>",
    "In-Reply-To: <quote@example.com>",
    "References: <first@example.com> <quote@example.com>",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "We accept quotation Q-100. Please proceed.",
    "",
    "On Tue, Sales wrote:",
    "> Price: USD 10.00"
  ].join("\r\n"));

  const parsed = await parseInboundMime(mime);
  assert.equal(parsed.classificationText, "We accept quotation Q-100. Please proceed.");
  assert.equal(parsed.referencesHeader, "<first@example.com> <quote@example.com>");
  assert.ok(parsed.bodyText.includes("Price: USD 10.00"));

  assert.equal(
    extractLatestReply("Could you reduce it to USD 9?\n\n--\nBuyer Name"),
    "Could you reduce it to USD 9?"
  );
  assert.equal(extractLatestReply("> prior quote only"), "");
  assert.equal(extractLatestReply("x".repeat(MAX_REPLY_CLASSIFICATION_CHARS + 10)).length, MAX_REPLY_CLASSIFICATION_CHARS);

  await assert.rejects(
    () => parseInboundMime(Buffer.alloc(MAX_INBOUND_SOURCE_BYTES + 1)),
    /exceeds/
  );

  console.log("email-mime-parser.spec.ts OK");
}

void main();
