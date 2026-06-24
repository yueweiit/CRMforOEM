# AI 预算化摘要流水线设计

## 目标

官网分析和背调报告都会遇到同一个问题：原始信息很多，直接一次性投喂给 LLM 容易超长、成本高、返回不稳定；但简单裁剪又可能丢掉影响判断的关键信息。

本设计的目标是建立一套可复用的 AI 预算化摘要流水线：

- 原始数据完整保存，不因为 AI 输入限制而丢失证据。
- AI 输入分层受限，避免单次请求过长。
- 尽量覆盖高价值信息，提高官网分析和背调报告的可信度。
- 控制调用次数和输入规模，使功能可以被多次使用。
- 局部失败不拖垮整个报告，能保存部分成功结果。

## 设计原则

- `30,000` 字符只作为绝对硬上限，不作为日常目标。
- 最终报告输入目标控制在 `12,000 - 16,000` 字符。
- 最终报告输入超过 `18,000` 字符进入警戒压缩。
- 最终报告输入硬上限为 `20,000` 字符。
- 单次分组或批次摘要输入目标控制在 `8,000 - 12,000` 字符。
- 原始数据完整落库，最终报告只读取结构化摘要，不直接读取完整原文。
- 复用预算、分批、JSON 校验、摘要合并等通用能力；不复用不同业务的分组规则。

## 总体架构

整体分为两层：通用能力层和业务编排层。

### 通用能力层

通用能力层不关心官网分析或背调报告的业务含义，只负责让输入规模、输出结构和失败处理可控。

建议组件：

- `AiBudgetService`
  - 负责字符预算、警戒线判断、硬上限检查。
  - 对每次 LLM 输入做 `JSON.stringify(input).length` 检查。

- `AiTextCompressor`
  - 负责文本清洗、空白归一、字符串截断、列表限量。
  - 去掉重复 URL、重复标题、重复导航文本等低价值内容。

- `AiBatchPlanner`
  - 负责把超长分组拆成多个 batch。
  - 每个 batch 都必须满足输入预算。

- `AiStructuredSummarizer`
  - 负责调用 LLM，把 batch 或 group 摘要成结构化 JSON。
  - 不直接返回自由长文。

- `AiSummaryMerger`
  - 负责把多个 batch summary 合并为 group summary。
  - 合并后再次检查长度，必要时做二次压缩。

- `AiJsonGuard`
  - 负责校验 AI 输出是否为合法 JSON。
  - 可以尝试提取 JSON；失败后重试一次；仍失败则返回降级结果。

### 业务编排层

业务编排层定义“哪些信息应该进入哪些组”，并决定最终报告的结构。

建议组件：

- `WebsiteAnalysisPipeline`
  - 官网分析专用流水线。
  - 负责页面分组、产品/联系方式/价格/品牌/OEM 机会摘要、最终官网业务报告。

- `ResearchReportPipeline`
  - 背调报告专用流水线。
  - 负责客户基础信息、官网分析、公开搜索、企业资料库、联系人、历史跟进、风险和机会摘要、最终背调报告。

## 官网分析数据流

```text
1. crawler 抓取官网原始数据
   ↓
2. 原始数据完整保存到 WebsiteAnalysis / WebsiteAnalysisPage / WebsiteAnalysisProduct
   ↓
3. WebsiteEvidenceGrouper 做确定性分组
   ↓
4. 每个分组进入 AiBatchPlanner
   ↓
5. 超预算分组拆成多个 batch
   ↓
6. 每个 batch 调用 LLM 生成 batch summary
   ↓
7. 同组多个 batch summary 合并成 group summary
   ↓
8. 最终报告只读取 group summaries，不读取完整原始数据
   ↓
9. 保存 aiInsights、evidencePages、summaryPipeline 和错误信息
```

官网分析建议分组：

- `brand_about`
  - 首页、品牌介绍、关于我们、公司背景。
- `product_catalog`
  - 产品列表、产品详情、产品分类、产品关键词。
- `contact_channel`
  - 邮箱、电话、地址、社媒、经销渠道、联系页面。
- `price_region`
  - 价格信号、币种、地区、语言、物流或市场区域。
- `oem_opportunity`
  - OEM 合作机会、产品匹配、潜在切入点。
- `risk_signal`
  - 信息缺失、官网质量、产品不匹配、合作风险。
- `uncertain`
  - 低置信度页面或不适合进入核心报告的内容。

## 背调报告数据流

```text
1. 收集客户资料、官网分析、公开搜索结果、企业资料库、联系人和历史跟进
   ↓
2. 按来源和业务意义分组
   ↓
3. 每组进入预算化摘要
   ↓
4. 多批摘要合并为 group summary
   ↓
5. 最终背调报告只读取结构化 group summaries
   ↓
6. 保存最终报告、证据来源、局部失败信息
```

背调报告建议分组：

- `customer_profile`
  - 客户名称、国家、行业、官网、阶段、来源等基础信息。
- `website_summary`
  - 官网分析沉淀出的结构化摘要。
- `public_search`
  - 公开搜索结果、新闻、官网外证据。
- `product_fit`
  - 企业资料库产品、能力、案例与客户业务的匹配关系。
- `contact_signals`
  - 联系人、邮箱、电话、部门、职位、沟通线索。
- `risk_signal`
  - 可信度风险、信息冲突、缺失信息、市场风险。
- `opportunity_signal`
  - 合作机会、切入点、优先推荐动作。
- `followup_context`
  - 历史邮件、跟进记录、任务和沟通上下文。

## 分组可靠性机制

分组不能依赖 LLM 自由判断，应使用确定性规则加置信度。

每个证据项输出以下结构：

```ts
type EvidenceGroupAssignment = {
  sourceId: string;
  url?: string;
  title?: string;
  primaryGroup: string;
  groups: string[];
  confidence: number;
  reasons: string[];
  selectedForAi: boolean;
};
```

判断信号包括：

- `pageType`
- URL 路径
- 页面标题
- headings
- textSummary
- 联系方式数量
- 产品候选数量
- 价格信号
- 页面深度

规则示例：

```text
产品组：
pageType 是 PRODUCT_DETAIL +50
pageType 是 PRODUCT_LIST +45
URL 包含 product/category/shop +25
标题或 heading 包含产品类词汇 +15
页面提取出产品候选 +30

联系方式组：
pageType 是 CONTACT +50
页面出现 email/phone/address +30
URL 包含 contact +25
标题包含 contact/us +15
```

一个页面可以有多个分组，但必须有主分组：

```json
{
  "primaryGroup": "brand_about",
  "groups": ["brand_about", "product_catalog", "contact_channel"],
  "confidence": 0.82,
  "reasons": ["HOME page", "contains product headings", "contains contact evidence"]
}
```

低置信度页面进入 `uncertain`，不强行塞进核心组。最终报告阶段可以少量抽样 `uncertain` 作为证据补充，但不能让它主导结论。

关键字段必须有兜底：

- 产品组为空，但 `result.products` 有数据时，从 `products` 构造产品摘要。
- 联系方式组为空，但 `contacts` 有数据时，从 `contacts` 构造联系方式摘要。
- 官网页面很少时，可以跳过分组摘要，直接使用轻量最终报告输入。

## 预算策略

### 全局预算

```text
全局绝对保护上限：30,000 字符
最终报告输入目标：12,000 - 16,000 字符
最终报告输入警戒线：18,000 字符
最终报告输入硬上限：20,000 字符
单次分组/批次输入目标：8,000 - 12,000 字符
单次分组/批次输入硬上限：16,000 - 18,000 字符
```

### 分组摘要输出约束

每个分组摘要必须是结构化 JSON，并限制字段数量和长度。

示例：

```json
{
  "summary": "不超过300字",
  "keyFacts": ["最多10条"],
  "risks": ["最多6条"],
  "opportunities": ["最多6条"],
  "evidencePages": ["最多8条"]
}
```

### 超限处理顺序

如果分组输入超过预算：

```text
1. 去重重复 URL、重复标题、重复产品。
2. 删除低价值字段，如导航链接、页脚链接、重复图片。
3. 降低长文本字段长度。
4. 减少低分证据项。
5. 按 batch 拆分。
6. 对 batch summary 做 group merge。
7. group summary 仍超限时做二次压缩。
```

## 错误处理

错误处理必须分层，避免局部失败拖垮整个报告。

### 官网抓取失败

官网抓取失败时，官网分析任务标记为 `FAILED`，记录失败原因。

### 分组失败

分组器异常时，使用当前已有的 `buildBoundedWebsiteAiInput` 作为兜底输入，保证官网分析仍可尝试生成报告。

### Batch 摘要失败

单个 batch 调用 AI 失败时：

```text
1. 重试一次。
2. 仍失败则标记该 batch failed。
3. 使用规则摘要作为该 batch 的 fallback summary。
4. 继续处理同组或其他组。
```

### Group 摘要失败

某个 group 失败时：

```text
1. 记录 group error。
2. 使用规则摘要或 batch summaries 的简化合并结果兜底。
3. 不阻断其他 group 和最终报告。
```

### 最终报告失败

最终报告 AI 调用失败时：

```text
1. 保存已生成的 group summaries。
2. 保存 summaryPipeline 状态。
3. 官网分析或背调报告展示为部分成功。
4. 前端提示“基础证据摘要已完成，最终 AI 报告失败”。
```

### 非 JSON 输出

AI 返回非 JSON 时：

```text
1. AiJsonGuard 尝试从文本中提取 JSON。
2. 提取失败则重试一次。
3. 仍失败则返回 fallback summary。
4. 原始错误写入 summaryPipeline.errors。
```

## 状态记录

短期内可以不新增数据库枚举，先把流水线状态记录在 `rawResult.summaryPipeline` 中。

示例：

```json
{
  "summaryPipeline": {
    "status": "partial_succeeded",
    "budget": {
      "finalInputChars": 14200,
      "hardLimit": 20000
    },
    "groups": {
      "brand_about": "succeeded",
      "product_catalog": "succeeded",
      "contact_channel": "fallback",
      "risk_signal": "failed"
    },
    "errors": [
      {
        "scope": "contact_channel",
        "message": "AI provider returned non-JSON response"
      }
    ]
  }
}
```

后续如果产品语义需要更清晰，再考虑新增 `PARTIAL_SUCCEEDED` 状态。

## 缓存与成本控制

中间摘要应该缓存，避免重复调用 LLM。

建议缓存 key：

```text
analysisId
groupName
batchIndex
contentHash
promptVersion
```

缓存命中条件：

- 原始内容没有变化。
- promptVersion 没有变化。
- 模型配置没有影响输出结构的变化。

成本控制策略：

- 普通官网最多 `4 - 6` 次 LLM 调用。
- 大官网最多 `8 - 10` 次 LLM 调用。
- 极端大官网只摘要高价值组，其余规则兜底。
- 每个失败调用最多重试一次。
- 低价值组默认不调用 LLM。
- 重新生成最终报告时优先复用 group summaries。

## 兼容当前实现

当前已有的 `buildBoundedWebsiteAiInput` 不需要废弃。

它在新架构中可以作为：

- 分组流水线异常时的兜底输入构建器。
- 小官网的轻量路径。
- 最终报告输入的最后安全保护。

当前已有的“官网抓取成功但 AI 总结失败仍保存 crawler 结果”的逻辑也应保留。新流水线只增强 AI 输入处理，不改变原始抓取结果完整保存的原则。

## 测试策略

### 预算测试

构造超大官网数据，验证：

- 单个 batch 输入不超过配置硬上限。
- group summary 输入不超过配置硬上限。
- final report 输入不超过 `20,000` 字符。
- 任何发送给 AI 的 JSON 都不超过 `30,000` 字符。

### 分组测试

构造以下页面：

- 首页
- 产品详情页
- 产品列表页
- 联系我们页
- 关于我们页
- FAQ 或隐私政策
- 混合型首页

验证：

- `primaryGroup` 符合预期。
- `groups` 支持多归属。
- `confidence` 合理。
- `reasons` 可解释。
- 低置信度页面进入 `uncertain`。

### 降级测试

模拟以下失败：

- 单个 batch AI 失败。
- 某个 group AI 失败。
- 最终报告 AI 返回非 JSON。
- AI 超时。
- 分组器异常。

验证：

- 其他 group 继续执行。
- 已生成摘要保存。
- `summaryPipeline.errors` 记录失败原因。
- 前端可以展示部分成功结果。

### 成本测试

构造 `10` 页、`30` 页、`100` 页官网数据，验证：

- LLM 调用次数不超过预算。
- 重复运行时缓存命中。
- 最终报告输入稳定在目标区间。
- 极端大官网会触发规则兜底，而不是无限分批。

### 背调报告复用测试

构造包含官网分析、公开搜索、企业资料库、联系人和跟进记录的大型背调上下文，验证：

- 每个来源进入正确分组。
- 背调最终报告只读取 group summaries。
- 某个来源摘要失败时，其他来源不受影响。
- 成本和输入长度符合预算。

## 推荐落地顺序

### 第一阶段：通用预算能力

新增通用预算、文本压缩、分批、JSON 守卫能力。

验收标准：

- 可以独立测试预算、截断、分批和 JSON 校验。
- 不改变现有官网分析和背调报告行为。

### 第二阶段：官网分析接入分组摘要流水线

在官网分析中引入分组、batch summary、group summary 和最终报告输入。

验收标准：

- 原始 crawler 数据仍完整保存。
- 大官网不会因为输入过长导致整份报告失败。
- 局部 AI 失败时能展示部分成功结果。

### 第三阶段：背调报告复用预算流水线

将背调报告上下文改为预算化分组摘要输入。

验收标准：

- 背调报告不再直接吃超大的原始上下文。
- 搜索结果、官网分析、企业资料库等来源可以局部失败、局部降级。
- 重复生成时能复用已有中间摘要，降低成本。

## 决策结论

推荐采用“规则筛选 + 业务分组 + 分批摘要 + 最终归纳”的方案。

该方案相比一次性裁剪，信息覆盖更完整；相比逐条投喂 LLM，成本更可控。它适合作为官网分析和背调报告的共同底层能力，但两个业务必须各自维护自己的分组规则和最终 prompt。
