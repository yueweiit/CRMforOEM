export type QuotePricingValue = number | string | null | undefined;

export type QuotePricingInput = {
  materialCost?: QuotePricingValue;
  processingCost?: QuotePricingValue;
  taxCost?: QuotePricingValue;
  shippingCost?: QuotePricingValue;
  discountAmount?: QuotePricingValue;
  quantity?: QuotePricingValue;
  moq?: QuotePricingValue;
};

export type QuotePricingResult = {
  materialCost: number;
  processingCost: number;
  taxCost: number;
  shippingCost: number;
  discountAmount: number;
  subtotal: number;
  total: number;
  quantity: number;
  moq: number;
  unitPrice: number;
  moqValid: boolean;
};

export const QUOTE_PRICING_FORMULA_TEXT = "总价 = 物料价 + 加工费 + 税费 + 运费 - 优惠金额";
export const QUOTE_UNIT_PRICE_FORMULA_TEXT = "单价 = 总价 / 数量";

export function calculateQuotePricing(input: QuotePricingInput): QuotePricingResult {
  const materialCost = normalizeMoney(input.materialCost);
  const processingCost = normalizeMoney(input.processingCost);
  const taxCost = normalizeMoney(input.taxCost);
  const shippingCost = normalizeMoney(input.shippingCost);
  const discountAmount = normalizeMoney(input.discountAmount);
  const quantity = normalizeInteger(input.quantity);
  const moq = normalizeInteger(input.moq ?? 1);
  const subtotal = roundMoney(materialCost + processingCost + taxCost + shippingCost);
  const total = roundMoney(subtotal - discountAmount);
  const unitPrice = quantity > 0 ? roundMoney(total / quantity) : 0;

  return {
    materialCost,
    processingCost,
    taxCost,
    shippingCost,
    discountAmount,
    subtotal,
    total,
    quantity,
    moq,
    unitPrice,
    moqValid: moq === 0 ? true : quantity >= moq
  };
}

function normalizeMoney(value: QuotePricingValue) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? roundMoney(normalized) : 0;
}

function normalizeInteger(value: QuotePricingValue) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? Math.max(Math.trunc(normalized), 0) : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
