import type { EmailGenerationContext, QuotationContextQuote } from "./types";

export function composeGeneratedEmailBody(aiProse: string, context: EmailGenerationContext) {
  if (!context.quotation) return aiProse.trim();
  return [aiProse.trim(), buildQuotationSummary(context.quotation.selectedQuote)]
    .filter(Boolean)
    .join("\n\n");
}

export function buildQuotationSummary(quote: QuotationContextQuote) {
  return [
    "Quotation summary",
    `Quote no.: ${quote.quoteNo}`,
    `Product: ${quote.productName}`,
    ...(quote.specification ? [`Specification: ${quote.specification}`] : []),
    `MOQ: ${quote.moq}`,
    `Quantity: ${quote.quantity}`,
    `Unit price: ${quote.currency} ${quote.unitPrice}`,
    `Total amount: ${quote.currency} ${quote.amount}`,
    ...(quote.validUntil ? [`Valid until: ${quote.validUntil.slice(0, 10)}`] : [])
  ].join("\n");
}
