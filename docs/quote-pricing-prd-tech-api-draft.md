# 报价模块价格计算 PRD、技术方案与接口草案

版本：v1.0  
适用范围：`报价模块`、`商业域 commercial`、`共享价格引擎 packages/shared`、`客户详情页报价面板`  
当前仓库现状：报价已具备草稿、审批、发送、客户接受/拒绝、到期、作废、历史记录、导出等能力；价格计算已在 `packages/shared/src/quote-pricing.ts` 与 `apps/api/src/modules/commercial/commercial.service.ts` 中形成基础闭环，但仍是平面成本加总模型，尚未覆盖 OEM 场景下的损耗、工时、贸易条款、税费口径、运费口径、利润率和价格快照版本化。

## 1. 任务背景

OEM 报价不是简单的“成本 + 利润”。在当前项目里，客户详情页已经有报价入口，后端也已经有 `/quotes` 相关接口，但现有价格公式仍然过于简化，只适合基础报价预览，不足以承载真实 OEM 场景中的成本拆解与报价合规。

本方案的目标不是重写报价模块，而是在现有 `commercial` 域上，把价格计算升级为“可解释、可追溯、可审批、可导出”的报价能力。

## 2. PRD

### 2.1 业务目标

1. 支持 OEM 报价的完整成本拆解。
2. 支持物料价、加工费、税费、运费、利润、折扣的统一计算。
3. 支持按贸易条款定义对外报价口径。
4. 支持报价快照留存，便于审计、争议回放和版本对比。
5. 支持每一条报价都必须经过审批后才能发送。
6. 支持前端实时预览和后端落库结果完全一致。

### 2.2 当前现状

#### 已有能力

1. `packages/shared/src/quote-pricing.ts` 已提供基础总价与单价计算。
2. `apps/api/src/modules/commercial/commercial.service.ts` 已在创建和更新报价时调用共享计算器。
3. `Quote` 表已保存 `materialCost`、`processingCost`、`taxCost`、`shippingCost`、`discountAmount`、`unitPrice`、`amount`。
4. `QuoteHistory` 已支持报价历史留痕。
5. 客户详情页 `apps/web/src/features/customers/detail/panels/QuotePanel.tsx` 已能展示成本拆分和实时预览。

#### 主要缺口

1. 当前公式是平面加总，缺少物料用量、损耗率、工时、贸易条款、税率、体积重等 OEM 关键输入。
2. 当前报价没有独立的价格快照模型，无法稳定回放“当时为什么是这个价”。
3. 当前前端预览和后端落库虽然复用同一函数，但输入合同过于简单，后续扩展会把复杂语义挤进单个表单。
4. 当前报价缺少清晰的“出厂价”和“对外报价”分层。

### 2.3 业务场景

#### 场景 A：基础 OEM 报价

1. 销售录入物料成本、加工成本、税费、运费、折扣。
2. 系统自动计算总价和单价。
3. 报价提交审批，通过后发送给客户。

#### 场景 B：DDP 报价

1. 销售选择 `DDP`。
2. 系统自动将关税、增值税、运费、港杂费纳入对外报价。
3. 对外报价与出厂价分离展示，避免口径混乱。

#### 场景 C：FOB / EXW 报价

1. 销售选择 `FOB` 或 `EXW`。
2. 系统仅计算工厂出厂价格或约定交付前的费用项。
3. 税费和运费根据条款是否承担决定是否进入最终报价。

#### 场景 D：任意报价审批

1. 任意新建报价都先处于草稿状态。
2. 销售提交后必须进入审批流。
3. 审批通过后才允许发送给客户。
4. 审批历史和价格快照一并保留。

### 2.4 角色与权限

| 角色 | 关注点 | 允许动作 |
| --- | --- | --- |
| 销售 | 录入报价、预览价格、发送报价 | 创建、编辑、提交审批、发送 |
| 主管 | 复核价格与折扣 | 审批通过、驳回 |
| 客户 | 查看对外报价 | 接受、拒绝 |
| 管理层 | 追踪利润、毛利、报价质量 | 查询、导出、统计 |

### 2.5 功能范围

| 功能 | 说明 | 优先级 |
| --- | --- | --- |
| 物料价计算 | 按用量、单价、损耗率计算 | P0 |
| 加工费计算 | 按工时、工时费率或手工加工费计算 | P0 |
| 税费计算 | 支持关税、增值税、其他税费 | P0 |
| 运费计算 | 支持毛重、体积重、运输单价 | P0 |
| 价格口径 | 支持出厂价、对外报价分层 | P0 |
| 折扣与利润 | 支持利润率、折扣额、折扣审批 | P0 |
| 快照留存 | 保存每次计算输入与输出 | P0 |
| 审批流程 | 所有报价默认都要走审批 | P0 |
| 导出联动 | 报价导出必须引用同一快照 | P1 |
| 客户级/产品级规则 | 支持价格模板和规则优先级 | P1 |
| 阶梯价 | 按数量区间计算单价 | P2 |

### 2.6 非目标

1. 本轮不把系统扩展成 ERP、WMS 或财务结算系统。
2. 本轮不做发票、收款、对账、应收应付。
3. 本轮不做复杂 MRP 生产计划。
4. 本轮不做完整物流跟单系统。

### 2.7 验收标准

1. 同一组输入，前端预览与后端落库结果一致。
2. 报价能够回放出完整计算过程。
3. 数量低于 MOQ 时不能保存。
4. DDP、FOB、EXW 的报价口径可区分且可解释。
5. 任意报价都必须先审批，审批通过后才允许发送。
6. 导出和发送引用的都是同一份价格快照。

## 3. 技术方案

### 3.1 设计原则

1. 价格引擎是单一真源，放在 `packages/shared`。
2. `commercial` 负责报价业务编排、权限校验、持久化和历史记录。
3. `web` 只做输入、展示和交互，不自己定义核心业务真相。
4. 报价主表保留对外展示字段，复杂计算细节通过快照承载。
5. 审批是报价生命周期的固定步骤，不依赖毛利阈值或折扣阈值决定是否进入审批。
6. 不引入散落在 UI 和接口里的临时计算分支。

### 3.2 推荐模块边界

| 层级 | 职责 | 不负责 |
| --- | --- | --- |
| `packages/shared` | 价格公式、输入校验、结果标准化、规则判断 | 数据库访问、权限、UI |
| `apps/api/modules/commercial` | 报价创建、更新、审批、发送、历史、导出、快照落库 | 页面渲染、前端预览 |
| `apps/web/features/customers/detail/panels/QuotePanel.tsx` | 表单录入、结果展示、操作触发 | 业务规则真相 |

### 3.3 推荐数据模型

#### 3.3.1 Quote 主表

保留当前主表作为报价单头与对外展示入口。

建议新增或强化字段：

| 字段 | 说明 |
| --- | --- |
| `incoterm` | 报价贸易条款，如 `EXW`、`FOB`、`CIF`、`DDP` |
| `pricingVersion` | 价格引擎版本号 |
| `pricingSnapshotId` | 当前生效快照指针 |
| `factoryAmount` | 出厂价或工厂口径金额 |
| `freightAmount` | 运费 |
| `dutyAmount` | 关税 |
| `vatAmount` | 增值税 |
| `otherFeeAmount` | 港杂费、保险费等其他费用 |
| `profitAmount` | 利润额 |
| `grossMarginRate` | 毛利率 |

#### 3.3.2 QuotePricingSnapshot

建议新增价格快照表，保存一次完整报价计算。

建议字段：

| 字段 | 说明 |
| --- | --- |
| `quoteId` | 关联报价 |
| `pricingVersion` | 引擎版本 |
| `inputJson` | 标准化输入 |
| `breakdownJson` | 分项计算结果 |
| `resultJson` | 汇总结果 |
| `createdById` | 生成快照的人 |
| `createdAt` | 生成时间 |

#### 3.3.3 规则中心

如果后续要做模板化报价，建议增加以下规则对象：

| 对象 | 作用 |
| --- | --- |
| `QuotePricingRule` | 客户级、产品级、区域级、条款级规则 |
| `ApprovalPolicy` | 审批人、审批顺序、审批备注规范 |

### 3.4 价格计算流程

1. 接收表单输入。
2. 标准化数值、币种、条款、税率、损耗率。
3. 计算物料成本。
4. 计算加工成本。
5. 计算税费。
6. 计算运费。
7. 按贸易条款合成对外报价。
8. 计算利润额、毛利率、单价、总价。
9. 校验 MOQ。
10. 标记报价为待审批或保持草稿，等待人工提交审批。
11. 生成价格快照。
12. 回写 `Quote` 主表与 `QuoteHistory`。

### 3.5 推荐公式

#### 3.5.1 物料成本

```text
物料成本 = 物料用量 × 物料单价 × (1 + 损耗率)
```

#### 3.5.2 加工成本

```text
加工成本 = 工时 × 工时费率
```

如果工厂直接填的是加工费，可把它作为加工成本的手工输入值。

#### 3.5.3 运费

```text
体积重 = 体积 ÷ 体积重量换算率
运费 = Max(毛重, 体积重) × 运输单价
```

#### 3.5.4 税费

```text
关税 = 进口货值 × 关税税率
增值税 = (货值 + 关税) × 增值税率
```

#### 3.5.5 出厂价与对外报价

```text
出厂价 = 物料成本 + 加工成本 + 分摊费用 + 利润
最终对外报价 = 出厂价 + 运费 + 税费 + 港杂费 + 保险费 - 优惠金额
```

### 3.6 共享价格引擎建议

建议把当前 `calculateQuotePricing` 扩展为三层：

1. 输入标准化层。
2. 成本计算层。
3. 结果汇总层。

建议新增的核心类型：

| 类型 | 作用 |
| --- | --- |
| `QuotePricingInput` | 标准化输入 |
| `QuotePricingContext` | 币种、条款、客户等级、规则版本 |
| `QuotePricingBreakdown` | 分项成本 |
| `QuotePricingResult` | 总价、单价、毛利、审批提示 |

### 3.7 前端改造建议

`apps/web/src/features/customers/detail/panels/QuotePanel.tsx` 建议改成三段式：

1. 基础信息区：报价编号、产品名、规格、币种、数量、MOQ、贸易条款。
2. 成本输入区：物料、加工、税费、运费、折扣、利润。
3. 结果展示区：出厂价、对外报价、单价、毛利率、审批提示。

前端只展示结果和审批提示，不再独立定义计算规则。

### 3.8 后端改造建议

`apps/api/src/modules/commercial/commercial.service.ts` 建议调整为：

1. 创建和更新报价时统一走价格引擎。
2. 保存报价前生成快照。
3. 审批通过与发送前校验价格快照版本。
4. 报价导出引用当前快照而不是临时重算。
5. 所有金额字段统一在后端按两位小数落库。

### 3.9 风险点

| 风险 | 说明 | 处理方式 |
| --- | --- | --- |
| 规则漂移 | 前后端各算一套 | 价格引擎单一真源 |
| 口径混乱 | 出厂价与对外价混用 | 明确分层字段和快照 |
| 审批失控 | 未审批报价被发送 | 所有报价统一强制审批 |
| 历史丢失 | 改价后无法回放 | 快照与历史同时保存 |
| 数据污染 | UI 直接造业务真相 | UI 只消费结果，不写规则 |

## 4. 接口草案

### 4.1 当前已存在接口

现有报价接口沿用当前项目语义：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/quotes?customerId=...` | 查询报价列表 |
| `POST` | `/quotes` | 新建报价 |
| `PATCH` | `/quotes/:id` | 更新报价 |
| `DELETE` | `/quotes/:id` | 作废报价 |
| `POST` | `/quotes/:id/submit-review` | 提交审批 |
| `POST` | `/quotes/:id/approve` | 审批通过 |
| `POST` | `/quotes/:id/reject` | 审批驳回 |
| `POST` | `/quotes/:id/send` | 发送报价 |
| `POST` | `/quotes/:id/accept` | 客户接受 |
| `POST` | `/quotes/:id/reject-customer` | 客户拒绝 |
| `POST` | `/quotes/:id/expire` | 到期失效 |
| `GET` | `/quotes/:id/history` | 查询报价历史 |
| `GET` | `/quotes/:id/export` | 导出单个报价 |
| `GET` | `/quotes/export?customerId=...` | 导出客户报价列表 |

### 4.2 新增建议接口

#### 4.2.1 报价价格预览

`POST /quotes/pricing-preview`

用途：在不落库的情况下，预览 OEM 报价结果。

请求体示例：

```json
{
  "customerId": "cus_123",
  "currency": "USD",
  "incoterm": "DDP",
  "quantity": 1000,
  "moq": 500,
  "profitRate": 0.18,
  "discountAmount": 0,
  "material": {
    "quantity": 1.2,
    "unitPrice": 3.5,
    "lossRate": 0.08
  },
  "processing": {
    "laborHours": 0.5,
    "hourlyRate": 12
  },
  "tax": {
    "dutyRate": 0.06,
    "vatRate": 0.13
  },
  "freight": {
    "grossWeight": 8.6,
    "volumeWeight": 6.3,
    "freightUnitPrice": 1.2,
    "dimensionalFactor": 6000
  }
}
```

响应体示例：

```json
{
  "pricingVersion": "v2",
  "moqValid": true,
  "summary": {
    "materialCost": 3.89,
    "processingCost": 6,
    "taxCost": 1.42,
    "freightCost": 10.32,
    "profitAmount": 2.88,
    "factoryAmount": 12.77,
    "totalAmount": 24.51,
    "unitPrice": 0.02,
    "grossMarginRate": 0.18
  },
  "breakdown": [
    {
      "code": "MATERIAL",
      "label": "物料成本",
      "amount": 3.89
    },
    {
      "code": "PROCESSING",
      "label": "加工成本",
      "amount": 6
    }
  ],
  "approvalRequired": true,
  "approvalReasons": ["毛利率低于阈值"]
}
```

#### 4.2.2 报价创建

`POST /quotes`

用途：创建报价并写入价格快照。

请求体建议：

```json
{
  "customerId": "cus_123",
  "quoteNo": "Q-20260710-001",
  "productName": "OEM Headset",
  "specification": "Bluetooth ANC",
  "currency": "USD",
  "quantity": 1000,
  "moq": 500,
  "incoterm": "FOB",
  "pricingInput": {
    "material": {
      "quantity": 1.2,
      "unitPrice": 3.5,
      "lossRate": 0.08
    },
    "processing": {
      "laborHours": 0.5,
      "hourlyRate": 12
    },
    "tax": {
      "dutyRate": 0.06,
      "vatRate": 0.13
    },
    "freight": {
      "grossWeight": 8.6,
      "volumeWeight": 6.3,
      "freightUnitPrice": 1.2
    },
    "profitRate": 0.18,
    "discountAmount": 0
  },
  "validUntil": "2026-08-10",
  "notes": "首版报价"
}
```

响应体建议返回：

```json
{
  "id": "quo_123",
  "quoteNo": "Q-20260710-001",
  "status": "DRAFT",
  "approvalStatus": "DRAFT",
  "pricingSnapshotId": "qps_123",
  "amount": 24.51,
  "unitPrice": 0.02,
  "factoryAmount": 12.77,
  "freightAmount": 10.32,
  "taxAmount": 1.42,
  "grossMarginRate": 0.18
}
```

#### 4.2.3 报价更新

`PATCH /quotes/:id`

用途：更新报价基础信息或价格输入，并生成新快照。

说明：

1. 更新后必须重新计算。
2. 旧快照保留，不覆盖。
3. 任何会影响金额、条款、数量或审批结论的变更，都应让报价回到待审批状态，避免跳过人工复核。

#### 4.2.4 报价快照查询

`GET /quotes/:id/pricing-snapshots`

用途：查看某张报价的历史价格快照。

响应示例：

```json
[
  {
    "id": "qps_001",
    "pricingVersion": "v1",
    "createdAt": "2026-07-10T08:00:00.000Z",
    "createdBy": {
      "id": "usr_1",
      "name": "Alice"
    }
  }
]
```

### 4.3 现有接口的语义约束

1. `POST /quotes/:id/send` 必须只允许已审批通过的报价发送。
2. `POST /quotes/:id/submit-review` 是每一条报价进入发送前的必经步骤。
3. `POST /quotes/:id/accept` 和 `POST /quotes/:id/reject-customer` 只允许 `SENT` 状态。
4. `POST /quotes/:id/expire` 只允许 `SENT` 状态。
5. `DELETE /quotes/:id` 只做作废，不做物理删除。
6. 所有变更都必须写入 `QuoteHistory`。

## 5. 推荐实施顺序

1. 先把共享价格引擎升级为结构化输入与结构化输出。
2. 再在后端加入价格快照落库。
3. 然后扩展报价主表的展示字段和审批状态表达。
4. 再改前端报价面板，分区展示输入、预览和结果。
5. 最后补导出、邮件附带报价和价格版本对比。

## 6. 需要确认的点

1. `incoterm` 是否作为报价主表字段落库，还是仅作为快照字段。
2. 第一版是否必须支持 `DDP`、`CIF`、`FOB`、`EXW` 全部条款。
3. 价格模板是否按客户、产品、国家三个维度一起做。
4. 审批人和审批流是否由 settings 配置中心统一管理。
5. 是否需要在报价导出中显示“出厂价”和“对外报价”两个口径。

## 7. 参考资料

1. Oracle CPQ: <https://www.oracle.com/cx/sales/cpq/>
2. Odoo pricing docs: <https://www.odoo.com/documentation/17.0/applications/sales/sales/products_prices/prices/pricing.html>
3. SAP CRM/CX: <https://www.sap.com/products/crm.html>
