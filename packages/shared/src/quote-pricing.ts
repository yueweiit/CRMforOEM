export type QuotePricingValue = number | string | null | undefined;

export type QuotePricingCalcMode = "formula" | "direct";

export type QuotePricingMaterialItem = {
  name?: string | null;
  usage?: QuotePricingValue;
  unitPrice?: QuotePricingValue;
  lossRate?: QuotePricingValue;
};

export type QuotePricingMaterialBreakdownItem = {
  name: string;
  usage: number;
  unitPrice: number;
  lossRate: number;
  baseCost: number;
  cost: number;
};

export type QuotePricingInput = {
  // 模式开关，默认 "direct"（直接录入，向后兼容）
  calcMode?: QuotePricingCalcMode;
  // —— 公式模式：物料明细 ——
  materialItems?: QuotePricingMaterialItem[] | null; // 多物料明细
  materialProfitRate?: QuotePricingValue;  // 物料利润率
  // —— 公式模式：加工明细 ——
  processingTime?: QuotePricingValue;           // 加工时间
  processingHourlyRate?: QuotePricingValue;     // 加工工时费率
  processingProfitRate?: QuotePricingValue;     // 加工利润率
  // —— 公式模式：运费明细 ——
  grossWeight?: QuotePricingValue;        // 毛重
  packageLength?: QuotePricingValue;      // 长
  packageWidth?: QuotePricingValue;       // 宽
  packageHeight?: QuotePricingValue;      // 高
  volumeDivisor?: QuotePricingValue;      // 体积系数
  shippingUnitPrice?: QuotePricingValue;  // 运输单位价格
  // —— 公式模式：税费 ——
  vatRate?: QuotePricingValue;            // 增值税率
  // —— 直接模式：金额直填（与现状完全一致）——
  materialCost?: QuotePricingValue;
  processingCost?: QuotePricingValue;
  taxCost?: QuotePricingValue;
  shippingCost?: QuotePricingValue;
  // —— 通用 ——
  discountAmount?: QuotePricingValue;
  quantity?: QuotePricingValue;
  moq?: QuotePricingValue;
};

export type QuotePricingBreakdown = {
  // 物料
  materialItems: QuotePricingMaterialBreakdownItem[];
  materialBaseCost: number;   // 多物料基础成本合计（未加损耗/利润）
  materialCost: number;       // 多物料损耗后成本合计（未加利润）
  materialQuote: number;      // 物料报价（加利润后，= 落库 materialCost）
  // 加工
  processingCost: number;     // 加工成本
  processingQuote: number;    // 加工费报价（= 落库 processingCost）
  // 运费
  volumeWeight: number;       // 体积重量 = 长 × 宽 × 高 ÷ 体积系数
  chargeableWeight: number;   // 计费重量 = Max(毛重, 体积重量)
  shippingCost: number;       // 运费（= 落库 shippingCost）
  // 税费
  taxBase: number;            // 税基 = 物料报价 + 加工费报价 + 运费
  taxCost: number;            // 税费（= 落库 taxCost）
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
  totalValid: boolean;
  nonNegativeItemValid: boolean;
  calcMode: QuotePricingCalcMode;
  breakdown?: QuotePricingBreakdown;
};

export const QUOTE_PRICING_FORMULA_TEXT = "总价 = 物料价 + 加工费 + 税费 + 运费 - 优惠金额";
export const QUOTE_UNIT_PRICE_FORMULA_TEXT = "单价 = 总价 / 数量";

export const QUOTE_FORMULA_TEXT_MATERIAL = "物料报价 = Sum(各物料用量 × 物料单价 × (1 + 该物料损耗率)) × (1 + 利润率)";
export const QUOTE_FORMULA_TEXT_PROCESSING = "加工费报价 = 加工时间 × 工时费率 × (1 + 利润率)";
export const QUOTE_FORMULA_TEXT_SHIPPING = "体积重量 = 长 × 宽 × 高 ÷ 体积系数；运费 = Max(毛重, 体积重量) × 运输单位价格";
export const QUOTE_FORMULA_TEXT_TAX = "税费 = (物料报价 + 加工费报价 + 运费) × 增值税率";

export function calculateQuotePricing(input: QuotePricingInput): QuotePricingResult {
  const calcMode: QuotePricingCalcMode = input.calcMode ?? "direct";
  const quantity = normalizeInteger(input.quantity);
  const moq = normalizeInteger(input.moq ?? 1);
  const discountAmount = normalizeMoney(input.discountAmount);

  let materialCost: number;
  let processingCost: number;
  let shippingCost: number;
  let taxCost: number;
  let breakdown: QuotePricingBreakdown | undefined;

  if (calcMode === "formula") {
    // 多物料基础成本 = Sum(各物料用量 × 物料单价)
    // 物料成本 = Sum(各物料用量 × 物料单价 × (1 + 该物料损耗率))
    // 物料报价 = 物料成本 × (1 + 物料利润率)
    const materialItems = normalizeMaterialItems(input.materialItems);
    const materialBaseCost = roundMoney(materialItems.reduce((total, item) => total + item.baseCost, 0));
    const matProfitRate = normalizeRate(input.materialProfitRate);
    const matCost = roundMoney(materialItems.reduce((total, item) => total + item.cost, 0));
    const matQuote = roundMoney(matCost * (1 + matProfitRate));

    // 加工成本 = 加工时间 × 加工工时费率
    // 加工费报价 = 加工成本 × (1 + 加工利润率)
    const procTime = normalizeMoney(input.processingTime);
    const procHourlyRate = normalizeMoney(input.processingHourlyRate);
    const procProfitRate = normalizeRate(input.processingProfitRate);
    const procCost = roundMoney(procTime * procHourlyRate);
    const procQuote = roundMoney(procCost * (1 + procProfitRate));

    // 体积重量 = 长 × 宽 × 高 ÷ 体积系数
    // 运费 = Max(毛重, 体积重量) × 运输单位价格
    const grossWeight = normalizeMoney(input.grossWeight);
    const packageLength = normalizeMoney(input.packageLength);
    const packageWidth = normalizeMoney(input.packageWidth);
    const packageHeight = normalizeMoney(input.packageHeight);
    const volumeDivisor = normalizeMoney(input.volumeDivisor);
    const volumeWeight = volumeDivisor > 0
      ? roundMoney((packageLength * packageWidth * packageHeight) / volumeDivisor)
      : 0;
    const shipUnitPrice = normalizeMoney(input.shippingUnitPrice);
    const chargeableWeight = roundMoney(Math.max(grossWeight, volumeWeight));
    const shipCost = roundMoney(chargeableWeight * shipUnitPrice);

    // 税费 = (物料报价 + 加工费报价 + 运费) × 增值税率
    const vatRate = normalizeRate(input.vatRate);
    const taxBase = roundMoney(matQuote + procQuote + shipCost);
    const taxAmount = roundMoney(taxBase * vatRate);

    materialCost = matQuote;
    processingCost = procQuote;
    shippingCost = shipCost;
    taxCost = taxAmount;
    breakdown = {
      materialItems,
      materialBaseCost,
      materialCost: matCost,
      materialQuote: matQuote,
      processingCost: procCost,
      processingQuote: procQuote,
      volumeWeight,
      chargeableWeight,
      shippingCost: shipCost,
      taxBase,
      taxCost: taxAmount
    };
  } else {
    // 直接录入模式：沿用现有逻辑
    materialCost = normalizeMoney(input.materialCost);
    processingCost = normalizeMoney(input.processingCost);
    taxCost = normalizeMoney(input.taxCost);
    shippingCost = normalizeMoney(input.shippingCost);
  }

  const subtotal = roundMoney(materialCost + processingCost + taxCost + shippingCost);
  const total = roundMoney(subtotal - discountAmount);
  const unitPrice = quantity > 0 ? roundMoney(total / quantity) : 0;

  // 金额类输入非负校验：禁止单项负数报价（如负的优惠金额把优惠变成加价、负的成本项）。
  // 比率类输入（利润率、损耗率）业务上允许为负（让利/亏损），不参与该校验；
  // 增值税率不允许为负，参与该校验。
  const directAmountInputs = [
    input.materialCost,
    input.processingCost,
    input.taxCost,
    input.shippingCost
  ];
  const formulaAmountInputs = [
    input.processingTime,
    input.processingHourlyRate,
    input.grossWeight,
    input.packageLength,
    input.packageWidth,
    input.packageHeight,
    input.volumeDivisor,
    input.shippingUnitPrice,
    input.vatRate,
    ...(input.materialItems ?? []).flatMap((item) => [item?.usage, item?.unitPrice])
  ];
  const nonNegativeItemValid = calcMode === "formula"
    ? [input.discountAmount, ...formulaAmountInputs].every((value) => normalizeMoney(value) >= 0)
    : [input.discountAmount, ...directAmountInputs].every((value) => normalizeMoney(value) >= 0);

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
    moqValid: moq === 0 ? true : quantity >= moq,
    totalValid: total >= 0,
    nonNegativeItemValid,
    calcMode,
    breakdown
  };
}

function normalizeMoney(value: QuotePricingValue) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? roundMoney(normalized) : 0;
}

function normalizeRate(value: QuotePricingValue) {
  // 利润率/损耗率/增值税率：0.05 表示 5%
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeMaterialItems(items: QuotePricingInput["materialItems"]): QuotePricingMaterialBreakdownItem[] {
  return (items ?? [])
    .map((item, index) => {
      const usage = normalizeMoney(item?.usage);
      const unitPrice = normalizeMoney(item?.unitPrice);
      const lossRate = normalizeRate(item?.lossRate);
      const baseCost = roundMoney(usage * unitPrice);
      return {
        name: normalizeMaterialName(item?.name, index),
        usage,
        unitPrice,
        lossRate,
        baseCost,
        cost: roundMoney(baseCost * (1 + lossRate))
      };
    })
    .filter((item) => item.usage > 0 || item.unitPrice > 0 || item.cost > 0);
}

function normalizeMaterialName(name: string | null | undefined, index: number) {
  const trimmed = name?.trim();
  return trimmed || `物料${index + 1}`;
}

function normalizeInteger(value: QuotePricingValue) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? Math.max(Math.trunc(normalized), 0) : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
