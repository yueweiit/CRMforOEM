# 报价成本公式扩展方案

## 设计核心思路

公式模式与直接录入模式并存，通过 `calcMode: "formula" | "direct"` 显式开关切换。

两种模式最终都产出同一组汇总金额字段：`materialCost`(物料报价) / `processingCost`(加工费报价) / `shippingCost`(运费) / `taxCost`(税费) / `discountAmount`。

- **公式模式**：这 4 个字段由明细输入（多物料用量/单价/逐物料损耗率、物料利润率、工时/费率、毛重/长宽高/体积系数、运输单价、增值税率）算出。
- **直接模式**：用户直接填这 4 个金额，与现状完全一致。

落库的 `materialCost` 语义统一为"物料报价（含利润）"，直接模式下就是用户填的物料价，公式模式下是 `Sum(各物料用量 × 单价 × (1 + 该物料损耗率)) × (1 + 利润率)`。这与公式 `税费 = (物料报价 + 加工费报价 + 运费) × 增值税率` 一致。

---

## 公式落地（以公式模式为例）

```
多物料基础成本 = Sum(各物料用量 × 物料单价)
物料成本 = Sum(各物料用量 × 物料单价 × (1 + 该物料损耗率))
物料报价 = 物料成本 × (1 + 物料利润率)          → 存入 materialCost
加工成本 = 加工时间 × 加工工时费率
加工费报价 = 加工成本 × (1 + 加工利润率)        → 存入 processingCost
体积重量 = 长 × 宽 × 高 ÷ 体积系数
运费 = Max(毛重, 体积重量) × 运输单位价格        → 存入 shippingCost
税费 = (物料报价 + 加工费报价 + 运费) × 增值税率 → 存入 taxCost
subtotal = 物料报价 + 加工费报价 + 运费 + 税费
total = subtotal - 优惠金额
unitPrice = total / quantity
```

直接模式下：跳过所有明细，直接用 `materialCost` / `processingCost` / `shippingCost` / `taxCost` 输入值走 `subtotal → total → unitPrice` 路径（即现有逻辑）。

---

## 改动文件清单（最小改动）

### 1. `packages/shared/src/quote-pricing.ts`（核心真源，唯一计算逻辑 owner）

扩展 `QuotePricingInput`，新增可选明细字段 + `calcMode`：

```ts
export type QuotePricingInput = {
  // 模式开关，默认 "direct"（直接录入，向后兼容）
  calcMode?: "formula" | "direct";
  // —— 公式模式：物料明细 ——
  materialItems?: Array<{
    name?: string | null;                 // 物料名
    usage?: QuotePricingValue;            // 物料用量
    unitPrice?: QuotePricingValue;        // 物料单价
    lossRate?: QuotePricingValue;         // 该物料损耗率（0.05 表示 5%）
  }> | null;
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
```

`QuotePricingResult` 新增 `breakdown` 明细（可选，便于历史快照和前端展示计算过程）：

```ts
export type QuotePricingBreakdown = {
  // 物料
  materialItems: Array<{
    name: string;
    usage: number;
    unitPrice: number;
    lossRate: number;
    baseCost: number;
    cost: number;
  }>;
  materialBaseCost: number;   // 多物料基础成本合计（未加损耗/利润）
  materialCost: number;       // 物料成本（加损耗后，未加利润）
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
  materialCost: number;       // 物料报价（两种模式下含义统一）
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
  calcMode: "formula" | "direct";
  breakdown?: QuotePricingBreakdown;  // 仅公式模式有值
};
```

`calculateQuotePricing` 逻辑分两支：

- `calcMode === "formula"`：用明细算出 `materialCost` / `processingCost` / `shippingCost` / `taxCost`，填入 `breakdown`，再走 `subtotal → total → unitPrice`。
- 否则（`direct`）：完全沿用现有逻辑（`normalizeMoney` 直接取输入值），`breakdown` 为 `undefined`。

新增公式文本常量：

```ts
export const QUOTE_FORMULA_TEXT_MATERIAL = "物料报价 = Sum(各物料用量 × 物料单价 × (1 + 该物料损耗率)) × (1 + 利润率)";
export const QUOTE_FORMULA_TEXT_PROCESSING = "加工费报价 = 加工时间 × 工时费率 × (1 + 利润率)";
export const QUOTE_FORMULA_TEXT_SHIPPING = "体积重量 = 长 × 宽 × 高 ÷ 体积系数；运费 = Max(毛重, 体积重量) × 运输单位价格";
export const QUOTE_FORMULA_TEXT_TAX = "税费 = (物料报价 + 加工费报价 + 运费) × 增值税率";
```

### 2. `packages/shared/src/index.ts`

导出新增的类型 `QuotePricingBreakdown` 和新公式常量。

### 3. `apps/api/prisma/schema.prisma`（Quote 模型扩展 + 1 条 migration）

在 Quote 模型新增字段（全部 `Decimal @default(0)` 或可选），用于持久化公式模式的计算明细输入，使历史快照可还原计算过程：

```
calcMode              String    @default("direct")
materialItems         Json?     // 多物料明细 [{name, usage, unitPrice, lossRate}]
materialProfitRate    Decimal?  // 物料利润率
processingTime        Decimal?  // 加工时间
processingHourlyRate  Decimal?  // 加工工时费率
processingProfitRate  Decimal?  // 加工利润率
grossWeight           Decimal?  // 毛重
packageLength         Decimal?  // 长
packageWidth          Decimal?  // 宽
packageHeight         Decimal?  // 高
volumeDivisor         Decimal?  // 体积系数
shippingUnitPrice     Decimal?  // 运输单位价格
vatRate               Decimal?  // 增值税率
```

配套 migration：`apps/api/prisma/migrations/<timestamp>_quote_formula_breakdown/migration.sql`，`ALTER TABLE quotes ADD COLUMN ...`，全部允许 `NULL`（向后兼容直接模式存量数据）。

> 不新增 `QuotePricingSnapshot` 表（已确认扩展现有 `QuoteHistory` 快照即可）。

### 4. `apps/api/src/modules/commercial/dto/create-quote.dto.ts` & `update-quote.dto.ts`

`CreateQuoteDto` 新增可选字段：`calcMode`（`@IsString()` + `@IsIn(["formula","direct"])`）、`materialItems`（`@IsArray()` + `@ValidateNested({ each: true })`，每行含 `name?`、`usage`、`unitPrice`、`lossRate?`）、`materialProfitRate`、`processingTime`、`processingHourlyRate`、`processingProfitRate`、`grossWeight`、`packageLength`、`packageWidth`、`packageHeight`、`volumeDivisor`、`shippingUnitPrice`、`vatRate`。除 `materialItems` 外的数值字段使用 `@IsOptional() @IsNumber()`。

`UpdateQuoteDto` 同样新增，全可选。

### 5. `apps/api/src/modules/commercial/commercial.service.ts`

- **`createQuote`**：`calculateQuotePricing` 调用入参新增 `calcMode` 和明细字段；落库 `tx.quote.create` 的 `data` 新增这些字段的 `new Prisma.Decimal(...)`（直接模式或字段未提供时写 `0` 或 `null`）。
- **`updateQuote`**：合并逻辑扩展——`dto.materialItems ?? quote.materialItems`，其余数值字段按 `dto.xxx ?? Number(quote.xxx)` 合并；`calcMode` 用 `dto.calcMode ?? quote.calcMode`。
- **`buildQuoteSnapshot`**：入参类型和返回 JSON 新增上述输入字段 + `calcMode`，并包含计算出的 `volumeWeight`，确保历史快照含完整计算输入与结果。
- **`buildQuoteCsv` / `buildQuotesCsv`**：CSV 头和数据行追加明细列（物料明细含逐物料损耗率、物料利润率、加工工时/费率/利润率、毛重/长/宽/高/体积系数/体积重量/运输单价/增值税率、计算模式）。批量导出 `buildQuotesCsv` 同步。

### 6. `apps/web/src/features/customers/detail/shared/types.ts`

Quote 类型新增 `materialItems` 数组（每行含 `lossRate`）、其余输入明细字段（Prisma Decimal 序列化为字符串）、计算结果 `volumeWeight` 和 `calcMode: string`。

### 7. `apps/web/src/features/customers/detail/panels/QuotePanel.tsx`

- form / editForm state 新增 `calcMode`、`materialItems` 和其余明细输入字段（数值初值 `""`，物料明细初值 1 行空物料，`calcMode` 初值 `"direct"`）。
- 新增表单开关 UI（复选框或切换按钮"成本计算模式 / 直接录入模式"），位于成本输入区顶部。
- 开关为 `formula` 时：隐藏物料价/加工费/运费/税费 4 个直填输入框，改为显示可增删的物料行（物料名/用量/单价/损耗率）、物料利润率、加工时间/工时费率/加工利润率、毛重/长/宽/高/体积系数/运输单价、增值税率；体积重量、单价、计算总价只读展示（由 `calculateQuotePricing` 算出）。
- 公式模式布局要求：物料行按“物料名 / 用量 / 单价 / 损耗率 / 删除”横向排列；长、宽、高、体积系数必须作为同一组横向展示，窄屏再响应式折行，避免尺寸字段散落在不同位置。
- 新建报价表单按公式分段展示：物料报价、加工费、运费、税费、汇总分别独立成区；每区顶部显示对应公式，输入项按公式顺序排列，计算结果字段只读展示。运费区拆成“体积重量 = 长 × 宽 × 高 ÷ 体积系数”和“运费 = Max(毛重, 体积重量) × 运输单位价格”两行公式组，确保长、宽、高、体积系数在同一行；第二行按体积重量、毛重、运输单位价格、运费排列。
- 开关为 `direct` 时：保持现有 4 个金额输入框不动。
- `buildQuotePayload` / `buildQuoteEditPayload`：透传 `calcMode` 和明细字段（直接模式下这些字段为空/0，后端落库为 null/0）。
- 列表行的公式摘要 `物料 X + 加工 Y...` 不变（两种模式下 `materialCost` / `processingCost` / `taxCost` / `shippingCost` 都有值）。
- 详情 Dialog 的物料价/加工费/税费/运费卡片不变；新增"计算快照"区，并按"公式名 + 粗体算式"展示，不再用一个字段一个卡片。公式模式下展示每行 `用量 × 单价 × (1 + 该物料损耗率) = 损耗后成本`、物料报价、加工、体积重量、运费、税费、总价和单价算式；直接模式下展示总价和单价算式。计算快照算式只显示数字，不显示币种单位。
- 公式文本展示区：`formula` 模式下显示新增的 4 条公式常量，`direct` 模式下保持现有 `QUOTE_PRICING_FORMULA_TEXT`。

### 8. `apps/api/src/modules/commercial/commercial.service.spec.ts`

现有断言（`subtotal=14.99` / `total=14.79` / `unitPrice=4.93`）是 direct 模式，`calcMode` 默认 `direct`，无需改动（向后兼容）。新增一组 formula 模式断言，验证：

```
物料A 6 × 单价2 × (1+0.05) + 物料B 4 × 单价2 × (1+0.05) = 21.00
21.00 × (1+0.1) = 23.10  → materialCost=23.10
工时2 × 费率5 × (1+0.1) = 11.00            → processingCost=11.00
体积重量 = 10 × 10 × 10 ÷ 200 = 5.00
Max(3, 5) × 2 = 10.00                        → shippingCost=10.00
(23.10 + 11.00 + 10.00) × 0.13 = 5.73        → taxCost=5.73
subtotal = 23.10 + 11.00 + 10.00 + 5.73 = 49.83
total = 49.83 - discount
```

---

## 改动边界与不变项

- **唯一计算逻辑 owner**：`packages/shared/src/quote-pricing.ts`。前后端不得各自实现公式。
- **不新增表、不新增 API 路由**：复用现有 `POST /quotes`、`PATCH /quotes/:id`，入参扩展可选字段。
- **向后兼容**：不传 `calcMode` 默认 `direct`，现有调用方、存量数据、现有测试不受影响。
- **历史保留**：`buildQuoteSnapshot` 扩展后，`QuoteHistory` 的 `before/after` JSON 含完整计算明细输入和结果，可还原任意时刻的计算过程。
- **CSV 导出**：同步扩展列，保证导出数据含成本明细。

---

## 验收方式

1. `pnpm --filter @oem-crm/shared build` 共享包构建通过，类型导出正确。
2. `pnpm --filter @oem-crm/api test`（或现有 spec 运行方式）通过，含新增 formula 模式断言。
3. `pnpm --filter @oem-crm/api prisma migrate dev` 生成并应用 migration 无报错。
4. `pnpm --filter @oem-crm/web build` 前端构建通过，无 TS 类型错误。
5. 手动验收（前端）：
   - 开关切到"成本计算模式"，填入明细，单价/计算总价实时按公式刷新。
   - 开关切回"直接录入模式"，4 个金额框直填，行为与改动前一致。
   - 保存后查看历史记录，`before/after` 含明细字段。
   - CSV 导出含新增列。
6. `pnpm lint`（若存在）无新增 warning。

---

## 未闭合风险 / 取舍说明

- 体积重量由 `长×宽×高÷体积系数` 在系统内计算，用户不直接录入体积重量；若体积系数为空或小于等于 0，体积重量按 0 参与 `Max(毛重, 体积重量)`。
- 物料损耗率已支持逐物料输入，每行物料按 `用量 × 单价 × (1 + 该物料损耗率)` 先算损耗后成本，再统一套物料利润率；不同物料利润率仍不做，若未来要按物料品类配置不同利润率，属于主数据扩展。
- 直接模式下，明细字段落库为 `0` 或 `null`（不影响计算）。历史快照中 direct 模式的明细字段为 `0`/`null`，属预期。
- `calcMode` 字段持久化后，编辑已存在的报价时会回填模式开关，确保列表/详情一致。

---

## 执行顺序

1. 共享包 `quote-pricing.ts` + `index.ts`（核心，先定合同）
2. Prisma schema + migration
3. 后端 DTO + service + spec
4. 前端 types + QuotePanel 表单
5. 全链路验收
