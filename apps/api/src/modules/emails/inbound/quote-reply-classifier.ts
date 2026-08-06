import { AiJsonGuard } from "../../ai/ai-json-guard";

export const QUOTE_REPLY_INTENTS = ["ACCEPT", "REJECT", "NEGOTIATE", "QUESTION", "UNCERTAIN"] as const;
export type QuoteReplyIntentValue = typeof QUOTE_REPLY_INTENTS[number];

export type QuoteReplyClassification = {
  intent: QuoteReplyIntentValue;
  confidence: number;
  evidence: string;
  reason: string;
};

const FALLBACK_CLASSIFICATION: QuoteReplyClassification = {
  intent: "UNCERTAIN",
  confidence: 0,
  evidence: "",
  reason: "AI classification unavailable or invalid"
};

export function buildQuoteReplyClassificationPrompt(input: {
  quoteNo: string;
  productName: string;
  currency: string;
  amount: string;
  replyText: string;
}) {
  return {
    system: [
      "Classify only the customer's latest reply to a quotation.",
      "Return one JSON object with intent, confidence, evidence, and reason.",
      "Allowed intent values: ACCEPT, REJECT, NEGOTIATE, QUESTION, UNCERTAIN.",
      "ACCEPT requires an explicit unconditional acceptance of this quotation.",
      "REJECT requires an explicit refusal or decision not to proceed.",
      "A counteroffer, condition, requested change, or partial acceptance is NEGOTIATE.",
      "A request for information without a decision is QUESTION.",
      "Out-of-office messages, quoted history, ambiguous language, or insufficient evidence are UNCERTAIN.",
      "Evidence must be an exact short excerpt from replyText. Never infer from quoted history."
    ].join(" "),
    user: JSON.stringify(input)
  };
}

export function parseQuoteReplyClassification(content: string, replyText: string): QuoteReplyClassification {
  const parsed = new AiJsonGuard().parseObject(content);
  if (!parsed.ok) return FALLBACK_CLASSIFICATION;

  const intent = normalizeIntent(parsed.data.intent);
  const confidence = normalizeConfidence(parsed.data.confidence);
  const evidence = normalizeText(parsed.data.evidence, 500);
  const reason = normalizeText(parsed.data.reason, 1000) || FALLBACK_CLASSIFICATION.reason;
  const exactEvidence = evidence && replyText.toLocaleLowerCase().includes(evidence.toLocaleLowerCase())
    ? evidence
    : "";

  if ((intent === "ACCEPT" || intent === "REJECT") && !exactEvidence) {
    return {
      intent: "UNCERTAIN",
      confidence: 0,
      evidence: "",
      reason: "Classifier did not provide exact reply evidence"
    };
  }

  return { intent, confidence, evidence: exactEvidence, reason };
}

function normalizeIntent(value: unknown): QuoteReplyIntentValue {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (QUOTE_REPLY_INTENTS as readonly string[]).includes(normalized)
    ? normalized as QuoteReplyIntentValue
    : "UNCERTAIN";
}

function normalizeConfidence(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
