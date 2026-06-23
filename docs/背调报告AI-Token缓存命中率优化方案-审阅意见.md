# 背调报告 AI Token 缓存命中率优化方案 —— 审阅意见

## 1. 总体评价

方案方向正确，问题诊断准确。四个核心原因抓得很准：

1. 动态客户上下文太靠前
2. 上下文太大
3. Prisma 完整对象字段太多
4. 数组和搜索结果排序不稳定

建议按 Phase 1 → Phase 2 → Phase 3 顺序推进，每阶段独立验证效果。

## 2. 当前代码问题确认

`research.processor.ts:80-165` `buildContext` 返回的上下文结构：

```
{
  customer,              // 完整 Prisma 对象 (source, type, owner 全嵌套)  ← 最靠前 + 最动态
  contacts,              // 完整 Prisma 对象数组
  websiteAnalysis,       // pages + products 全部字段
  websiteInsights,       // 已从 rawResult.aiInsights 提取 ✅
  publicSearch,          // 搜索结果，顺序不稳定
  sourceEvidence,        // URLs / 搜索摘要 / 联系人  ← 与输出 source_basis 信息重复
  companyKnowledge: {
    profiles,            // 含嵌套 capabilities/products/certificates/caseStudies/emailMaterials
    products,            // ← 与 profiles 中的 products 完全重复
    capabilities,        // ← 与 profiles 中的 capabilities 完全重复
    caseStudies,         // ← 与 profiles 中的 caseStudies 完全重复
    certificates         // ← 与 profiles 中的 certificates 完全重复
  },
  priorMessages,         // 邮件线程 + 消息，变化频繁
  salesNotes
}
```

### 实测最大的 token 浪费源：companyKnowledge 内部重复

一个组织 3 个 profile，每个 profile 含 80 个 products。240 个产品对象被传了两遍（一遍在 profiles 内嵌，一遍在扁平数组）。产品描述和案例文本都很长，这部分浪费可能超过整个 customer 对象的体积。

### sourceEvidence 与输出 source_basis 信息重复

context 中 URL 列表、搜索结果摘要在 prompt 中传给 AI，AI 再在 `source_basis` 中重新组织一遍。token 利用率低。

## 3. 方案中值得肯定的设计

| 设计 | 理由 |
|------|------|
| 5.1 StableResearchContext DTO | 去掉 Prisma 元数据字段，只保留 AI 真正需要的字段 |
| 5.2 CustomerResearchContext DTO | 客户侧同样 compact，pages 只保留 url/pageType/title/textSummary |
| 7. 稳定排序 + stableStringify | `Object.keys()` 在 Prisma 查询间不一定稳定，稳定序列化对缓存命中至关重要 |
| 9. 分阶段落地 | Phase 1 不改业务流程只 compact，风险最低 |
| 组织资料放前面、客户动态放后面 | 前缀缓存的核心策略 |

## 4. 需要补充的问题

### 4.1 companyKnowledge 去重应当作为 Phase 1 的第一优先级

profiles 数组和扁平数组（products/capabilities/caseStudies/certificates）存在一对一重复。建议在 compact DTO 时直接去掉 profiles，只保留扁平数组并设置数量上限。这是单次改动、ROI 最高的项。

### 4.2 方案没有提到 `sourceEvidence` 的取舍

当前 context 中有大量 URL 和摘要信息，AI 的输出 schema 又要求生成 `source_basis`。两者内容高度重叠。建议：

- 保留对 AI 推理有直接价值的证据（如关键页面 title 和 textSummary）
- 移除纯 URL 罗列（`crawledUrls`、`publicSearchResults`）
- 让 AI 从已提供的 pages/products 信息中自然引用来源

### 4.3 prompt_cache_key 做成可选配置

OpenAI prompt caching 依赖 exact prefix match（参考 https://platform.openai.com/docs/guides/prompt-caching）。`prompt_cache_key` 字段可以加，但：

- 当前 `AiProviderService` 是兼容 OpenAI Chat Completions 的通用封装
- 如果 `AI_BASE_URL` 指向第三方兼容网关（如 OneAPI / LiteLLM），它未必支持这个字段
- 建议做成可选配置，放入 Phase 2 或 Phase 3，不在 Phase 1 引入

### 4.4 companyKnowledge 稳定性假设需要验证

方案将 `companyKnowledge` 视为"稳定内容"放在前缀区域。但如果后台频繁维护产品/能力/案例资料，它也会导致 cache miss。建议后续加 `companyKnowledgeHash` 或版本号，当资料变更时接受一次 miss 而非持续漂移。

### 4.5 系统 Prompt 本身 ~2K tokens 未被缓存利用

当前 `researchSystemPrompt()` 把系统指令和 JSON Schema 混在一起。如果 API 支持 system message 级别的缓存（Anthropic 支持，OpenAI 视情况），可以考虑将 JSON Schema 单独提取为可版本化的常量。

## 5. 文件拆分建议 —— 当前不做，直接压 buildContext() 返回值

方案 11 节建议的 `StableResearchContextBuilder` / `CustomerResearchContextBuilder` 等文件拆分属于过度设计。当前 `buildContext()` 是一个私有方法，直接压缩其返回结构是最高效、最直接的改动。等 compact 验证效果后，如果确实需要独立复用，再考虑抽 builder。

## 6. 执行顺序（修订建议）

### Phase 1：Compact（优先做，不改文件结构，只压 buildContext() 返回值）

1. **去重 companyKnowledge** —— 去掉 profiles 数组，只保留扁平数组，加数量上限。**最大收益点。**
2. **Prisma → DTO** —— 按方案 5.1/5.2 裁剪所有字段，删除 `id`/`createdAt`/`updatedAt`/`rawResult` 等无关字段
3. **调整 key 顺序（静态在前，动态在后）** —— `promptVersion` → `outputSchema` → `companyKnowledge` → `customer` → `websiteAnalysis` → `publicSearch` → `salesNotes`。OpenAI prompt caching 依赖 exact prefix match，静态前置是缓存命中的前提。
4. **稳定排序 + stableStringify** —— 保证前缀一致性。有必要但不是最大收益点，体积和去重优先。
5. **去掉 sourceEvidence 的纯 URL 罗列** —— 与输出 `source_basis` 重叠部分不传入 prompt，只保留对 AI 推理有价值的页面摘要。

### Phase 2：拆分（Phase 1 验证效果后）

1. 抽取 `buildStableOrgContext`
2. 抽取 `buildCustomerResearchContext`
3. 拆分 system prompt（系统指令 + JSON Schema 分离）

### Phase 3：观测

1. 前端展示 `prompt_tokens` / `cached_tokens` / `cacheHitRate`
2. 统计 AI 空返回次数
3. 统计 AI 失败兜底次数

## 7. 风险控制表

| 风险 | 控制方式 |
|------|----------|
| 压缩过度导致报告质量下降 | 先保留核心字段，逐步减少 pages/products/messages 数量，每轮对比报告质量 |
| 字段排序改变影响 AI 输出 | 只改数据顺序不改字段语义，保留 `promptVersion: "research-report-v3"` → v4 |
| 组织资料过大 | companyKnowledge 也设上限，后续引入摘要缓存 |
| companyKnowledge 频繁变更导致 cache miss | 观测阶段跟踪变更频率，必要时做资料版本 hash |

## 8. 结论

方案原理正确、阶段划分合理、风险可控。建议先做 Phase 1 去重和 compact，验证 token 下降和缓存命中率变化后再推进 Phase 2。Phase 1 的核心收益点在 **companyKnowledge 去重** 和 **Prisma 对象 → compact DTO**，两者都是低风险、高回报的改动。
