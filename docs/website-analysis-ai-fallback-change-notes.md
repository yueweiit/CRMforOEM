# 官网分析与背调 AI 可靠性优化落地方案

## 1. 文档定位

这份文档不再只是变更说明，而是后续开发官网产品分析、客户背景调查报告时可执行的设计方案。

目标是解决两个核心问题：

- 官网抓取已经有数据，但 AI 因输入过长、返回空内容、非 JSON、限流或超时导致报告生成失败。
- 背调报告和官网分析需要信息完整度、来源依据和业务准确性，不能为了“能生成”而过度裁剪关键证据。

本方案优先级：

1. 信息完整度和准确性优先。
2. 成本可控，避免无意义重复调用 AI。
3. 抓取数据和 AI 总结失败解耦。
4. 所有结论尽量可追溯到来源页面、产品、联系方式或公开搜索结果。

## 2. 业务需求映射

### 2.1 客户背景调查报告固定结构

背调报告最终应稳定输出以下 8 个部分：

1. 公司基本信息
2. 企业背景和发展历程
3. 核心业务与产品线
4. 市场表现与竞争格局
5. 品牌策略与营销方式
6. 产品价格定位
7. 官网产品专项分析
8. 总结和智能开发建议

### 2.2 官网产品分析维度

官网分析模块至少要覆盖：

| 分析项 | 目标 |
| --- | --- |
| 产品分类 | 统计主营产品类目，梳理产品结构 |
| 产品数量 | 判断产品线完善程度和采购体量 |
| 产品描述 | 提取材质、工艺、环保、功能、卖点等信息 |
| 图片风格 | 判断品牌审美、产品档次、目标消费人群 |
| 价格区间 | 判断价格定位，匹配我方供货价格体系 |
| 缺失品类 | 找出客户官网未覆盖但我方可生产的品类 |
| 匹配机会 | 结合我方产品和产能输出合作切入方向 |

### 2.3 当前方案已经做对的部分

当前代码已经具备一个可靠基础：

- 官网抓取和 AI 总结失败已经解耦。
- AI 输入已经有字段裁剪和总字符上限。
- AI 返回 JSON 字段有逐字段降级。
- 前端可以在 AI 总结失败时继续展示抓取结果和基础分析。

这些方向需要保留。

## 3. 当前方案需要补强的问题

### 3.1 没有 AI 重试机制

目前 `generateAiInsights()` 中 AI 调用失败后会直接进入 fallback。

这会把以下临时问题都暴露给用户：

- 429 限流
- 网络抖动
- 模型服务瞬时过载
- 超时
- 首次返回空内容
- 首次返回非 JSON

这些问题通常可以通过 1 到 2 次重试解决，不应该直接降级。

### 3.2 字符长度不是 token 长度

当前使用：

```ts
JSON.stringify(input).length <= WEBSITE_AI_INPUT_CHAR_LIMIT
```

字符数可以作为工程上限，但不能完全等价于模型 token。

建议后续保留字符上限，同时增加估算 token 上限：

- 直接总结模式：AI 用户输入建议控制在 12,000 到 16,000 字符以内，超过 18,000 字符进入警戒，20,000 字符作为直接总结硬上限。
- 分组总结模式：单个分组输入建议控制在 12,000 到 16,000 字符以内。
- 30,000 字符只作为硬保护线，不作为常规目标。

原因：系统 prompt、JSON 结构、模型输出空间也会消耗上下文。如果把用户输入打满 30,000 字符，遇到中文、长 URL、大量 JSON 字段时仍然可能不稳定。

### 3.3 极端超长时不应该再调用 AI

当前 `buildMinimalWebsiteAiInput()` 会构造一个极小输入继续调用 AI。

问题是：如果输入已经被压缩到几乎没有产品、页面、联系方式，AI 再总结的业务价值会很低，还会浪费一次 API 成本。

建议：

- 如果最小输入仍然超过硬上限，直接跳过 AI。
- 如果最小输入低于上限但信息量过少，也不要强行生成“看似完整”的 AI 报告。
- 前端显示为“抓取完成，AI 总结因输入过大跳过，当前展示基础抓取报告”。

### 3.4 非 JSON 不应该被当作成功

当前 `parseWebsiteAiInsights()` 对非 JSON 会返回 fallback。

这会造成一个隐藏问题：AI 实际没有输出有效 JSON，但上层可能把本次 AI run 当作成功。

建议改成：

- 解析函数返回 `{ ok: true, data }` 或 `{ ok: false, reason, fallback }`。
- 非 JSON、空内容、关键字段缺失时先触发重试。
- 重试后仍失败，才持久化 fallback，并把 AI run 标记为 `FAILED` 或 `PARTIAL/FALLBACK` 元信息。

### 3.5 缺少可观测性

当前只把错误写入 `rawResult.aiInsightError` 和 `errorMessage`。

建议增加 `rawResult.aiMeta`：

```ts
type WebsiteAiMeta = {
  mode: "DIRECT" | "BATCH_SUMMARY" | "FALLBACK" | "SKIPPED";
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  inputChars: number;
  estimatedInputTokens?: number;
  attemptCount: number;
  retryCount: number;
  batchCount?: number;
  failedBatchCount?: number;
  errorKind?: "TIMEOUT" | "RATE_LIMIT" | "INVALID_JSON" | "EMPTY_RESPONSE" | "INPUT_TOO_LARGE" | "PROVIDER_ERROR";
  errorMessage?: string;
};
```

这样后续可以排查：

- 是不是经常走 fallback。
- 是不是某些网站输入特别大。
- 是不是 AI 服务经常返回空内容或非 JSON。
- 是否需要调整分组大小和预算。

## 4. 推荐总体架构

### 4.1 预算化摘要流水线架构

官网分析和背调报告都必须走“预算化摘要流水线”。

核心约束：

- 原始数据完整保存。
- AI 不直接吃无限原始数据。
- 超预算内容先分组、拆 batch、摘要、合并。
- 最终报告只读取预算内的结构化摘要，不读取完整原始数据。

整体分两层：通用能力层 + 业务编排层。

通用能力层负责控长度、分批、摘要、合并：

```text
common/ai-generation/
  ai-generation.types.ts       # 通用类型、错误枚举、meta
  ai-budget.service.ts         # 字符预算、硬上限检查、警戒线判断
  ai-text-compressor.ts        # 文本清洗、截断、列表限量、URL/重复内容压缩
  ai-batch-planner.ts          # 把超预算 group 拆成 batch
  ai-structured-summarizer.ts  # 调用 LLM，把 batch/group 摘成结构化 JSON
  ai-summary-merger.ts         # 把多个 batch summary 合并成 group summary
  ai-retry.service.ts          # 重试、退避、Retry-After、修复型重试
  ai-json-guard.ts             # JSON 提取、结构校验、失败重试或降级
  ai-source-id.service.ts      # sourceId 生成、校验、引用过滤
  ai-summary-cache.service.ts  # batch/group summary 缓存，避免重复调用
```

业务编排层负责“什么信息应该进哪个组”：

```text
website-analysis/
  website-analysis.pipeline.ts
  builders/website-evidence-grouper.ts
  builders/
    website-ai-input.builder.ts          # 直接总结输入构建
    website-ai-batch-input.builder.ts    # 分组总结输入构建
  services/
    website-ai-insight.service.ts        # 编排 AI 生成、重试、降级
    website-ai-retry.service.ts          # 判断错误类型和重试
    website-ai-budget.service.ts         # 字符和 token 预算估算
  processors/
    website-analysis.processor.ts        # 队列处理，只负责编排抓取和持久化
  parsers/
    website-ai-insight.parser.ts         # AI JSON 解析和字段校验
  website-analysis.types.ts              # 类型定义

research/
  research-report.pipeline.ts
  builders/research-context-builder.ts
  builders/research-prompt-builder.ts
  builders/research-evidence-grouper.ts
  builders/research-evidence-inventory.builder.ts
  services/research-ai-report.service.ts
  parsers/research-report.parser.ts
```

业务职责：

- `WebsiteAnalysisPipeline`：页面分组、产品/联系方式/价格/品牌/OEM 机会摘要、最终官网业务报告。
- `ResearchReportPipeline`：官网分析摘要、搜索结果摘要、企业资料库摘要、联系人/邮件/跟进摘要、风险/机会/匹配度摘要、最终背调报告。

重点：

- 通用层复用预算和摘要机制。
- 业务层各自定义分组规则和 prompt。
- 业务层不得绕过通用预算机制直接把完整原始数据喂给最终报告 prompt。

### 4.2 两种 AI 生成模式

#### 模式 A：直接总结

适用条件：

- 抓取页面数量较少。
- 产品数量较少。
- 直接构造后的 AI 输入小于常规预算。

优点：

- 调用成本最低。
- 结构简单。
- 报告一致性好。

缺点：

- 对大型官网不稳定。

#### 模式 B：分组总结 + 最终归纳

适用条件：

- 官网页面多。
- 产品多。
- 产品描述、页面摘要、联系方式、分类信息较长。
- 直接输入超过常规预算，但又不希望过度裁剪。

流程：

1. 先把抓取结果拆成多个稳定分组。
2. 每组单独让 AI 提炼事实摘要和来源 ID。
3. 最后把各组摘要和关键原始证据喂给 AI，生成完整官网分析报告。

优点：

- 信息完整度更高。
- 不需要一刀切丢弃大量页面。
- 每个结论更容易绑定来源。

缺点：

- 调用次数增加。
- 需要严格控制分组和最终归纳成本。

推荐策略：

- 默认先尝试直接总结。
- 如果直接输入超过 18,000 字符，优先切换到分组总结；如果超过 20,000 字符，不允许继续走直接总结。
- 如果分组总结成本过高，限制最大分组数量，剩余数据进入“未纳入 AI 总结但已保存抓取结果”的提示。

## 5. 数据流设计

### 5.1 官网分析数据流

```text
用户点击官网分析
  -> 创建 WebsiteAnalysis 记录，状态 QUEUED
  -> 创建 AiGenerationRun，状态 QUEUED
  -> 队列处理器开始执行
  -> 更新 WebsiteAnalysis 为 RUNNING
  -> 爬取官网
  -> 原始数据完整保存到 WebsiteAnalysis / WebsiteAnalysisPage / WebsiteAnalysisProduct
  -> WebsiteEvidenceGrouper 做确定性分组
     - brand_about
     - product_catalog
     - contact_channel
     - price_region
     - oem_opportunity
     - risk_signal
     - uncertain
  -> 读取企业资料库产品和 OEM 能力
  -> 每个 group 进入 AiBatchPlanner
  -> 超预算 group 拆成多个 batch
  -> 每个 batch 调用 LLM 生成 batch summary
  -> 同组多个 batch summary 合并成 group summary
  -> 最终官网报告只读取 group summaries
  -> 保存 final aiInsights / evidencePages / aiInsightError / aiMeta
  -> WebsiteAnalysis 标记 SUCCEEDED
```

关键收益：

- 原始数据完整保留。
- AI 永远只吃预算内的结构化输入。
- 最终报告不会因为原始抓取数据过多而直接失败。

### 5.2 背调报告数据流

```text
用户点击生成背调报告
  -> 创建 ResearchReport 和 AiGenerationRun
  -> 构建背调上下文
  -> 收集客户资料、官网分析、搜索结果、企业资料库、联系人、历史跟进
  -> 按来源和业务意义分组
     - customer_profile
     - website_summary
     - public_search
     - product_fit
     - contact_signals
     - risks
     - opportunities
     - followup_context
  -> 每组预算化摘要
  -> 最终背调报告只读取结构化 group summaries
  -> 解析和校验 8 个固定板块
  -> 保存 reportJson、finalMarkdown、sourceEvidence、aiMeta
```

背调报告已有 `RESEARCH_PROMPT_MAX_CHARS = 12_000` 和多档裁剪。
后续接入预算化摘要流水线时，应保留这些限制，并把它们升级为 group/batch 的预算规则。

### 5.3 sourceId 设计

为了保证分组不会错位，所有原始证据进入 AI 前必须先生成稳定 ID。

示例：

```ts
type WebsiteEvidenceItem =
  | {
      sourceId: `page:${number}`;
      kind: "PAGE";
      url: string;
      pageType: string;
      title?: string;
      textSummary?: string;
    }
  | {
      sourceId: `product:${number}`;
      kind: "PRODUCT";
      name: string;
      category?: string;
      evidenceUrls: string[];
    }
  | {
      sourceId: `contact:${number}`;
      kind: "CONTACT";
      type: string;
      value: string;
      sourceUrl?: string;
    };
```

规则：

- `sourceId` 在一次分析任务内稳定。
- 分组只传 `sourceId` 和必要内容。
- AI 输出必须引用 `sourceId`。
- 后端校验 AI 返回的 `sourceId` 是否存在。
- 不存在的 `sourceId` 丢弃，并记录解析警告。

这样可以避免“分组总结说的是 A 页面，最终报告却引用 B 页面”的问题。

## 6. 分组策略

### 6.1 分组原则

分组不能只按数组切片。应按业务语义分组：

1. `brand_about`：首页、关于、品牌故事、公司介绍。
2. `product_catalog`：产品列表页、产品详情页、产品分类。
3. `contact_channel`：联系页、邮箱、电话、表单、社媒。
4. `price_region`：价格、币种、区域市场、销售渠道信号。
5. `oem_opportunity`：产品缺口、OEM/ODM 合作机会、我方能力匹配。
6. `risk_signal`：官网缺失、低可信、风险、未知项。
7. `uncertain`：低置信度页面，不强行塞入错误分组。

### 6.2 分组示例

```ts
type WebsiteAiBatch = {
  batchId: string;
  batchType: "BRAND_ABOUT" | "PRODUCT_CATALOG" | "CONTACT_CHANNEL" | "PRICE_REGION" | "OEM_OPPORTUNITY" | "RISK_SIGNAL" | "UNCERTAIN";
  title: string;
  sourceIds: string[];
  input: unknown;
  inputChars: number;
};
```

### 6.3 分组上限

建议第一版上限：

| 项目 | 建议值 |
| --- | --- |
| 单个分组输入 | 12,000 到 16,000 字符 |
| 最大分组数 | 8 |
| 单组最大页面数 | 6 |
| 单组最大产品数 | 12 |
| 最终归纳输入 | 12,000 到 16,000 字符，硬上限 20,000 字符 |
| 硬保护上限 | 30,000 字符 |

超过上限的内容不要丢失到数据库，只是不进入 AI 总结。

前端和报告中应提示：

```text
本次官网抓取数据较多，AI 已优先分析高价值页面和产品信息，完整抓取数据仍保存在技术明细中。
```

### 6.4 分组可靠性规则

分组不能靠 LLM 猜，应该用确定性规则加置信度。

每个页面或证据项分组后输出：

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

判断依据包括：

- `pageType`。
- URL 路径。
- title。
- headings。
- textSummary。
- 联系方式数量。
- 产品候选数量。
- 价格信号。
- 页面深度。

规则：

- 允许一个页面进入多个组。
- 多组复用时要控制重复 token。
- 低置信度页面进入 `uncertain`。
- 不要为了“看起来完整”把证据强行塞进错误分组。

兜底规则：

- 产品组为空，但 `result.products` 有数据：直接从 products 构造产品摘要。
- 联系方式组为空，但 `contacts` 有数据：直接从 contacts 构造联系方式摘要。
- 官网页面很少：跳过分组摘要，直接用轻量最终报告输入。

### 6.5 分组不会错位的实现约束

分组可靠性的核心不是“让 AI 判断这页属于哪里”，而是后端用确定性规则先完成证据归档，再让 AI 只总结已经归档好的证据。

推荐顺序：

1. 把页面、产品、联系方式、价格信号、企业资料库匹配结果统一转换成 `EvidenceItem`。
2. 给每条证据生成稳定 `sourceId`。
3. 用规则打分决定 `primaryGroup` 和可选 `groups`。
4. 低置信度证据进入 `uncertain`，不强行进入核心业务组。
5. 构建 batch input 时只传 `sourceId`、必要摘要和关键字段。
6. AI 返回后校验 `sourceId` 是否存在，不存在的结论丢弃。
7. 最终报告只能引用已校验的 group summary 和 source index。

分组打分伪代码：

```ts
type EvidenceGroupName =
  | "brand_about"
  | "product_catalog"
  | "contact_channel"
  | "price_region"
  | "oem_opportunity"
  | "risk_signal"
  | "uncertain";

type GroupScore = {
  group: EvidenceGroupName;
  score: number;
  reasons: string[];
};

function assignWebsiteEvidenceGroup(item: WebsiteEvidenceItem): EvidenceGroupAssignment {
  const scores = new Map<EvidenceGroupName, GroupScore>();

  addPageTypeScore(scores, item);
  addUrlPathScore(scores, item);
  addTitleHeadingScore(scores, item);
  addContentSignalScore(scores, item);
  addStructuredDataScore(scores, item);

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  const best = ranked[0];

  if (!best || best.score < 40) {
    return {
      sourceId: item.sourceId,
      url: item.kind === "PAGE" ? item.url : undefined,
      title: item.title,
      primaryGroup: "uncertain",
      groups: ["uncertain"],
      confidence: 0.3,
      reasons: ["没有足够明确的页面类型、URL、标题或结构化信号"],
      selectedForAi: false
    };
  }

  const groups = ranked
    .filter((candidate) => candidate.score >= 55 || candidate.group === best.group)
    .slice(0, 3)
    .map((candidate) => candidate.group);

  return {
    sourceId: item.sourceId,
    url: item.kind === "PAGE" ? item.url : undefined,
    title: item.title,
    primaryGroup: best.group,
    groups,
    confidence: Math.min(best.score / 100, 1),
    reasons: best.reasons,
    selectedForAi: best.score >= 55
  };
}

function addPageTypeScore(scores: Map<EvidenceGroupName, GroupScore>, item: WebsiteEvidenceItem) {
  if (item.kind !== "PAGE") return;

  if (item.pageType === "HOME") addScore(scores, "brand_about", 80, "首页通常包含品牌定位和主营业务");
  if (item.pageType === "ABOUT") addScore(scores, "brand_about", 90, "关于页属于公司背景证据");
  if (item.pageType === "PRODUCT_LIST") addScore(scores, "product_catalog", 90, "产品列表页属于产品结构证据");
  if (item.pageType === "PRODUCT_DETAIL") addScore(scores, "product_catalog", 95, "产品详情页属于核心产品证据");
  if (item.pageType === "CONTACT") addScore(scores, "contact_channel", 95, "联系页属于联系方式证据");
}

function addUrlPathScore(scores: Map<EvidenceGroupName, GroupScore>, item: WebsiteEvidenceItem) {
  if (item.kind !== "PAGE") return;

  const path = new URL(item.url).pathname.toLowerCase();
  if (path.includes("product") || path.includes("catalog") || path.includes("shop")) {
    addScore(scores, "product_catalog", 30, "URL 包含产品或目录信号");
  }
  if (path.includes("contact") || path.includes("support")) {
    addScore(scores, "contact_channel", 40, "URL 包含联系或支持信号");
  }
  if (path.includes("about") || path.includes("brand") || path.includes("company")) {
    addScore(scores, "brand_about", 35, "URL 包含公司或品牌信号");
  }
}
```

兜底构造伪代码：

```ts
function buildWebsiteGroups(
  evidence: WebsiteEvidenceItem[],
  result: WebsiteAnalysisResult
): WebsiteEvidenceGroup[] {
  const sourceIndex = buildSourceIndex(evidence);
  const assignments = evidence.map(assignWebsiteEvidenceGroup);
  const groups = groupByAssignment(assignments, sourceIndex);

  if (!groups.product_catalog?.items.length && result.products.length) {
    groups.product_catalog = buildProductGroupFromCrawlerProducts(result.products);
  }

  if (!groups.contact_channel?.items.length && result.contacts.length) {
    groups.contact_channel = buildContactGroupFromCrawlerContacts(result.contacts);
  }

  if (isSmallWebsite(result)) {
    return [buildLightweightWholeSiteGroup(result, sourceIndex)];
  }

  return dedupeGroupSources(groups);
}
```

开发验收标准：

- 同一条证据可以进入多个组，但同一 `sourceId` 在同一个 batch 中只能出现一次。
- `primaryGroup` 必须来自规则得分最高的组，不能由 AI 改写。
- `confidence < 0.4` 的证据必须进入 `uncertain`。
- `selectedForAi=false` 的证据仍保存在数据库，但不进入 AI 输入。
- AI 返回的任何 `sourceId` 如果不在 `sourceIndex` 中，必须丢弃并记录 parser warning。

## 7. 错误处理策略

### 7.1 错误分类

| 错误类型 | 处理方式 |
| --- | --- |
| 官网不可访问 | WebsiteAnalysis 标记 FAILED |
| 部分页面失败 | WebsiteAnalysis 继续 SUCCEEDED，页面记录 errorMessage |
| AI 超时 | 重试 1 到 2 次 |
| AI 429 限流 | 按 Retry-After 或指数退避重试 |
| AI 空内容 | 重试 |
| AI 非 JSON | 使用修复 prompt 重试 1 次 |
| AI JSON 字段缺失 | 字段级 fallback，记录 parser warning |
| 最小输入仍超长 | 跳过 AI，保存抓取结果 |
| 分组部分失败 | 使用成功分组生成报告，记录 partial warning |

### 7.2 重试策略

建议第一版：

- 最大尝试次数：3 次，也就是首次调用 + 2 次重试。
- 退避时间：1 秒、3 秒。
- 如果 provider 返回 429 且有 `Retry-After`，优先使用 provider 建议。
- 非 JSON 可以只重试 1 次，并加上“修复为合法 JSON”的 prompt。
- 不对明显永久错误重试，比如 API key 未配置、模型不存在、输入硬超长。

伪代码：

```ts
async function completeWithRetry(input: AiCompletionInput): Promise<AiCompletionResult> {
  const attempts = [
    { delayMs: 0, repairJson: false },
    { delayMs: 1_000, repairJson: false },
    { delayMs: 3_000, repairJson: true }
  ];

  let lastError: unknown;

  for (const attempt of attempts) {
    if (attempt.delayMs) await sleep(attempt.delayMs);

    try {
      const completion = await aiProvider.complete(
        attempt.repairJson ? withJsonRepairInstruction(input) : input
      );

      if (!completion.content.trim()) {
        throw new AiOutputError("EMPTY_RESPONSE");
      }

      return completion;
    } catch (error) {
      lastError = error;
      if (!isRetryableAiError(error)) break;
    }
  }

  throw lastError;
}
```

### 7.3 解析策略

伪代码：

```ts
type ParseResult<T> =
  | { ok: true; data: T; warnings: string[] }
  | { ok: false; fallback: T; reason: string; warnings: string[] };

function parseWebsiteAiInsights(content: string, fallbackSource: WebsiteAnalysisResult): ParseResult<WebsiteAiInsights> {
  const parsed = safeJson(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: "INVALID_JSON",
      fallback: fallbackWebsiteAiInsights(fallbackSource),
      warnings: ["AI returned invalid JSON"]
    };
  }

  const warnings: string[] = [];
  const data = normalizeWebsiteAiInsights(parsed, fallbackSource, warnings);

  if (!data.business_summary || !data.main_business) {
    return {
      ok: false,
      reason: "MISSING_REQUIRED_FIELDS",
      fallback: data,
      warnings
    };
  }

  return { ok: true, data, warnings };
}
```

关键点：

- 非 JSON 不再静默成功。
- 字段缺失可以局部 fallback。
- 关键字段缺失要触发重试。
- 最终失败才写入 `rawResult.aiInsightError`。

### 7.4 分层错误处理

错误要分层处理，不能让一个局部失败拖垮整个报告。

| 失败位置 | 处理结果 | 状态建议 |
| --- | --- | --- |
| crawler 失败 | 官网分析没有可信原始数据，任务失败 | `WebsiteAnalysis.status=FAILED` |
| 原始数据持久化失败 | 不能进入 AI，任务失败 | `WebsiteAnalysis.status=FAILED` |
| 分组规则失败 | 回退到现有 `buildBoundedWebsiteAiInput()` | `aiMeta.status=PARTIAL` |
| 某个 batch summary 失败 | 重试一次，仍失败则标记该 batch failed，继续其他 batch | `summaryPipeline.groups[group].status=partial_succeeded` |
| 某个 group summary 失败 | 使用规则摘要兜底，并记录 group error | `summaryPipeline.groups[group].status=fallback` |
| 最终报告 AI 失败 | 保存 group summaries，前端展示基础证据摘要和 warning | `aiMeta.status=PARTIAL` 或 `FAILED` |
| AI 返回非 JSON | `AiJsonGuard` 尝试提取 JSON，失败后用修复 prompt 重试一次 | 仍失败则 fallback |

最终报告失败时不要丢掉已经成功的 group summaries。前端至少应能展示：

- 已抓取页面、产品、联系方式。
- 已成功生成的分组摘要。
- 哪些分组走了 fallback。
- 最终 AI 报告失败原因。

### 7.5 summaryPipeline 元数据

第一版不必新增数据库枚举，可以把流水线状态写入 `rawResult.summaryPipeline`。

示例：

```json
{
  "summaryPipeline": {
    "status": "partial_succeeded",
    "mode": "BATCH_SUMMARY",
    "inputChars": 18420,
    "finalInputChars": 13760,
    "attemptCount": 3,
    "retryCount": 1,
    "groups": {
      "brand_about": {
        "status": "succeeded",
        "batchCount": 1,
        "failedBatchCount": 0,
        "sourceCount": 4
      },
      "product_catalog": {
        "status": "partial_succeeded",
        "batchCount": 3,
        "failedBatchCount": 1,
        "sourceCount": 18
      },
      "contact_channel": {
        "status": "fallback",
        "batchCount": 0,
        "failedBatchCount": 0,
        "sourceCount": 3
      },
      "risk_signal": {
        "status": "failed",
        "batchCount": 1,
        "failedBatchCount": 1,
        "sourceCount": 2
      }
    },
    "errors": [
      {
        "scope": "batch",
        "groupName": "product_catalog",
        "batchId": "product_catalog:2",
        "errorKind": "TIMEOUT",
        "message": "AI request timed out"
      }
    ]
  }
}
```

状态口径：

- `succeeded`：该层完全成功。
- `partial_succeeded`：部分 batch 或 group 失败，但仍有有效摘要参与最终报告。
- `fallback`：AI 摘要失败，使用规则摘要兜底。
- `failed`：该层没有可用摘要。
- `skipped`：因输入无价值、低优先级或成本限制跳过。

## 8. AI 输入预算策略

### 8.1 预算目标

不要把 30,000 当目标值，只作为全局绝对保护上限。

建议第一版预算：

| 类型 | 目标 | 警戒线 | 硬上限 |
| --- | --- | --- | --- |
| 单次 LLM 输入 | 8,000 - 12,000 字符 | 14,000 字符 | 16,000 - 18,000 字符 |
| 最终报告输入 | 12,000 - 16,000 字符 | 18,000 字符 | 20,000 字符 |
| 全局绝对保护 | - | - | 30,000 字符 |

如果某个分组超过预算：

1. 先去重。
2. 再降低低价值字段。
3. 再按 batch 拆分。
4. batch summary 后再合并。
5. 最终仍超限则做二次压缩。

### 8.2 通用预算函数

伪代码：

```ts
const AI_BATCH_TARGET_CHARS = 12_000;
const AI_BATCH_WARNING_CHARS = 14_000;
const AI_BATCH_HARD_LIMIT_CHARS = 18_000;
const AI_FINAL_TARGET_CHARS = 16_000;
const AI_FINAL_WARNING_CHARS = 18_000;
const AI_FINAL_HARD_LIMIT_CHARS = 20_000;
const AI_GLOBAL_HARD_LIMIT_CHARS = 30_000;

function measureAiInput(input: unknown) {
  const json = typeof input === "string" ? input : JSON.stringify(input);
  return {
    chars: json.length,
    estimatedTokens: Math.ceil(json.length / 2)
  };
}

function chooseAiMode(input: unknown, evidenceCount: number): "DIRECT" | "BATCH_SUMMARY" | "SKIPPED" {
  const size = measureAiInput(input);

  if (size.chars <= AI_FINAL_TARGET_CHARS) {
    return "DIRECT";
  }

  if (size.chars > AI_GLOBAL_HARD_LIMIT_CHARS) {
    return evidenceCount > 0 ? "BATCH_SUMMARY" : "SKIPPED";
  }

  if (evidenceCount > 0) {
    return "BATCH_SUMMARY";
  }

  return "DIRECT";
}
```

### 8.3 摘要输出预算

分组摘要输出也必须受控，避免中间摘要越滚越大。

建议结构：

```json
{
  "summary": "不超过300字",
  "keyFacts": ["最多10条"],
  "risks": ["最多6条"],
  "opportunities": ["最多6条"],
  "evidencePages": ["最多8条"]
}
```

规则：

- batch summary 必须短于原 batch。
- group summary 必须短于 batch summary 总和。
- final report 只读取 group summary，不读取完整原文。
- `evidencePages` 只保存最关键来源，完整来源仍保存在数据库明细中。

### 8.4 裁剪顺序

裁剪必须优先保留业务价值高的信息：

优先保留：

- 首页
- 产品详情页
- 产品列表页
- 联系页
- 关于和品牌页
- 有价格信号的页面
- 有联系方式的页面
- 有产品分类证据的页面

优先裁剪：

- 404 或错误页
- 重复 URL
- 空摘要页面
- 低价值支持页
- 过长标题、链接、摘要、产品描述
- 重复产品和重复关键词

### 8.5 缓存与成本控制

为了同时满足信息完整度和成本可控，中间摘要应该可缓存。第一版可以先把缓存写入 `rawResult.summaryPipeline.cache` 或现有 AI 内容版本表；后续如果查询和复用频率高，再独立建表。

缓存 key 建议由以下字段组成：

```ts
type AiSummaryCacheKey = {
  scopeId: string;        // websiteAnalysisId 或 researchReportId
  groupName: string;
  batchIndex: number;
  contentHash: string;    // batch 输入内容稳定 hash
  promptVersion: string;
};
```

命中缓存的条件：

- 原始证据内容没有变化。
- 分组规则版本没有变化。
- prompt 版本没有变化。
- 输出 schema 版本没有变化。

成本限制建议：

| 场景 | LLM 调用预算 |
| --- | --- |
| 小官网 | 直接总结，最多 1 到 2 次调用 |
| 普通官网 | 最多 4 到 6 次调用 |
| 大官网 | 最多 8 到 10 次调用 |
| 极端大官网 | 只让高价值组进入 AI，其余组使用规则摘要 |
| 背调报告 | 按来源组摘要，最终报告单独 1 次调用，总调用数需要受配置限制 |

规则：

- 每个 batch 最多重试 1 次，最终报告最多重试 1 到 2 次。
- 低价值组可以直接规则摘要，不调用 AI。
- 达到任务级最大调用次数后，剩余组进入 `skipped` 或 `fallback`。
- 重新生成最终报告时，如果 group summary 缓存命中，不重新调用 batch summary。
- 对同一客户可增加每日重新分析次数上限，避免误操作造成成本失控。

## 9. AI 生成编排伪代码

### 9.0 预算化摘要流水线

官网分析和背调报告都应遵循同一条流水线：

```ts
async function runBudgetedSummaryPipeline(rawEvidence: EvidenceItem[], plan: BusinessGroupPlan) {
  await plan.persistRawEvidence(rawEvidence);

  const grouped = plan.group(rawEvidence);
  const groupSummaries: GroupSummary[] = [];
  const groupErrors: SummaryPipelineError[] = [];

  for (const group of grouped) {
    try {
      const ruleFallback = plan.buildRuleSummary(group);
      const compressed = AiTextCompressor.compressGroup(group);
      const batches = AiBatchPlanner.plan(compressed, {
        targetChars: AI_BATCH_TARGET_CHARS,
        warningChars: AI_BATCH_WARNING_CHARS,
        hardLimitChars: AI_BATCH_HARD_LIMIT_CHARS
      });

      const batchSummaries: BatchSummary[] = [];
      for (const batch of batches) {
        const cacheKey = AiSummaryCache.buildKey({
          scopeId: plan.scopeId,
          groupName: group.groupName,
          batchIndex: batch.batchIndex,
          contentHash: batch.contentHash,
          promptVersion: plan.batchPromptVersion
        });

        const cached = await AiSummaryCache.getBatchSummary(cacheKey);
        if (cached) {
          batchSummaries.push(cached);
          continue;
        }

        try {
          const completion = await AiStructuredSummarizer.summarizeBatchWithRetry(batch);
          const guarded = AiJsonGuard.parseBatchSummary(completion.content, group.sourceIds);

          if (!guarded.ok) throw new AiOutputError(guarded.reason);

          await AiSummaryCache.saveBatchSummary(cacheKey, guarded.data);
          batchSummaries.push(guarded.data);
        } catch (error) {
          groupErrors.push(plan.toPipelineError("batch", group.groupName, batch.batchId, error));
        }
      }

      if (!batchSummaries.length) {
        groupSummaries.push(ruleFallback);
        continue;
      }

      const merged = AiSummaryMerger.mergeBatchSummaries(batchSummaries, group.groupName, ruleFallback);
      groupSummaries.push(merged);
    } catch (error) {
      groupErrors.push(plan.toPipelineError("group", group.groupName, undefined, error));
      groupSummaries.push(plan.buildRuleSummary(group));
    }
  }

  const finalInput = AiTextCompressor.compressFinalInput(groupSummaries, {
    targetChars: AI_FINAL_TARGET_CHARS,
    hardLimitChars: AI_FINAL_HARD_LIMIT_CHARS
  });

  try {
    return await AiStructuredSummarizer.summarizeFinalReportWithRetry(finalInput);
  } catch (error) {
    return plan.buildPartialResult({
      groupSummaries,
      errors: [...groupErrors, plan.toPipelineError("final", undefined, undefined, error)]
    });
  }
}
```

约束：

- `rawEvidence` 必须先完整保存。
- `finalInput` 只能来自 `groupSummaries`。
- 不允许最终报告 prompt 直接读取完整原始页面、完整搜索结果或完整历史记录。

### 9.1 直接总结流程

```ts
async function generateWebsiteAiInsights(result: WebsiteAnalysisResult, companyProfile: WebsiteAnalysisCompanyProfile) {
  const evidence = buildWebsiteEvidenceInventory(result);
  const directInput = buildBoundedWebsiteAiInput(result, companyProfile, evidence);
  const mode = chooseAiMode(directInput, evidence.length);

  if (mode === "SKIPPED") {
    return {
      insights: fallbackWebsiteAiInsights(result),
      meta: buildSkippedMeta("INPUT_TOO_LARGE")
    };
  }

  if (mode === "DIRECT") {
    return generateDirectInsights(directInput, result);
  }

  return generateBatchSummaryInsights(result, companyProfile, evidence);
}

async function generateDirectInsights(input: unknown, result: WebsiteAnalysisResult) {
  try {
    const completion = await completeWithRetry({
      system: websiteAnalysisPrompt(),
      user: JSON.stringify(input),
      jsonMode: true
    });

    const parsed = parseWebsiteAiInsights(completion.content, result);

    if (!parsed.ok) {
      throw new AiOutputError(parsed.reason);
    }

    return {
      insights: parsed.data,
      meta: buildSuccessMeta("DIRECT", completion, parsed.warnings)
    };
  } catch (error) {
    return {
      insights: fallbackWebsiteAiInsights(result),
      meta: buildFailedMeta("DIRECT", error)
    };
  }
}
```

### 9.2 分组总结流程

```ts
async function generateBatchSummaryInsights(
  result: WebsiteAnalysisResult,
  companyProfile: WebsiteAnalysisCompanyProfile,
  evidence: WebsiteEvidenceItem[]
) {
  const batches = buildWebsiteAiBatches(evidence, companyProfile);
  const successfulSummaries: WebsiteBatchSummary[] = [];
  const failedBatches: WebsiteBatchFailure[] = [];

  for (const batch of batches.slice(0, MAX_WEBSITE_AI_BATCHES)) {
    try {
      const completion = await completeWithRetry({
        system: websiteBatchSummaryPrompt(),
        user: JSON.stringify(batch.input),
        jsonMode: true
      });

      const parsed = parseWebsiteBatchSummary(completion.content, batch.sourceIds);

      if (!parsed.ok) {
        throw new AiOutputError(parsed.reason);
      }

      successfulSummaries.push(parsed.data);
    } catch (error) {
      failedBatches.push({
        batchId: batch.batchId,
        reason: normalizeAiError(error)
      });
    }
  }

  if (!successfulSummaries.length) {
    return {
      insights: fallbackWebsiteAiInsights(result),
      meta: buildFailedMeta("BATCH_SUMMARY", failedBatches)
    };
  }

  const finalInput = buildWebsiteFinalSynthesisInput({
    summaries: successfulSummaries,
    companyProfile,
    sourceIndex: buildSourceIndex(evidence)
  });

  const completion = await completeWithRetry({
    system: websiteFinalSynthesisPrompt(),
    user: JSON.stringify(finalInput),
    jsonMode: true
  });

  const parsed = parseWebsiteAiInsights(completion.content, result);

  return {
    insights: parsed.ok ? parsed.data : parsed.fallback,
    meta: buildBatchMeta(successfulSummaries, failedBatches, parsed)
  };
}
```

## 10. 持久化设计

第一版不强制新增数据库字段，降低改动风险。

继续保存：

- `WebsiteAnalysis.status`
- `WebsiteAnalysis.errorMessage`
- `WebsiteAnalysis.rawResult`
- `WebsiteAnalysisPage`
- `WebsiteAnalysisProduct`
- `AiGenerationRun`
- `AiContentVersion`

建议 `rawResult` 增加结构：

```ts
rawResult: {
  ...crawlerResult,
  aiInsights,
  aiInsightError,
  aiMeta,
  sourceEvidence: {
    pages: Array<{ sourceId: string; url: string; title?: string; pageType: string }>;
    products: Array<{ sourceId: string; name: string; category?: string; evidenceUrls: string[] }>;
    contacts: Array<{ sourceId: string; type: string; value: string; sourceUrl?: string }>;
  }
}
```

`WebsiteAnalysis.status` 语义：

| 场景 | WebsiteAnalysis.status | aiMeta.status |
| --- | --- | --- |
| 官网抓取失败 | FAILED | FAILED |
| 抓取成功，AI 成功 | SUCCEEDED | SUCCEEDED |
| 抓取成功，AI 部分失败 | SUCCEEDED | PARTIAL |
| 抓取成功，AI 完全失败但 fallback 成功 | SUCCEEDED | FAILED |
| 抓取成功，AI 因输入过大跳过 | SUCCEEDED | SKIPPED |

这样不用马上改 Prisma enum，也能让前端区分“业务数据成功”和“AI 总结质量”。

## 11. 前端展示策略

前端不要只看 `analysis.status`。

建议展示三种状态：

1. 完整 AI 官网分析：`status=SUCCEEDED` 且 `aiMeta.status=SUCCEEDED`。
2. 部分 AI 分析：`status=SUCCEEDED` 且 `aiMeta.status=PARTIAL`。
3. 基础抓取分析：`status=SUCCEEDED` 且 `aiMeta.status=FAILED/SKIPPED`。

展示文案：

```text
官网抓取已完成，AI 总结未完整生成。当前展示的是抓取结果和系统基础分析，建议稍后重试 AI 总结。
```

如果分组部分失败：

```text
官网数据较多，系统已优先分析高价值页面。部分低优先级页面未纳入 AI 总结，完整抓取数据仍可在技术明细查看。
```

前端还需要展示来源依据：

- 有效证据页面
- 产品分类证据链接
- 联系方式来源链接
- AI 引用的 `sourceId` 对应 URL

## 12. 背调报告与官网分析的共同底座

背调报告不应该等官网分析稳定后再“复用”。
两者都应该共同依赖预算化摘要流水线。

建议抽一个通用的 AI 预算与摘要能力：

```text
common/ai-generation/
  ai-budget.service.ts
  ai-text-compressor.ts
  ai-batch-planner.ts
  ai-structured-summarizer.ts
  ai-summary-merger.ts
  ai-retry.service.ts
  ai-json-guard.ts

website-analysis/
  website-analysis.pipeline.ts
  builders/website-evidence-grouper.ts

research/
  research-report.pipeline.ts
  builders/research-evidence-grouper.ts
  builders/research-evidence-inventory.builder.ts
  builders/research-batch-input.builder.ts
  services/research-ai-report.service.ts
```

背调报告与官网分析的区别：

- 官网分析主要处理官网抓取页面、产品、联系方式。
- 背调报告还要处理公开搜索结果、CRM 联系人、客户历史记录、官网分析结果、企业资料库匹配结果。

但通用流程一致：

```text
原始证据
  -> sourceId 标准化
  -> 确定性分组
  -> batch 规划
  -> batch summary
  -> group summary
  -> 最终报告只读取 group summaries
  -> 校验来源
  -> 保存报告和来源依据
```

## 13. 推荐开发阶段

### 第一阶段：通用 AI 稳定底座和最小接入

目标：先建立预算、重试、解析、分组摘要流水线的通用能力，并让官网分析和背调报告完成最小接入。

第一阶段必须拆成可单独验证的小步骤：

#### 1.1 通用预算与压缩能力

开发项：

- 新增 `AiBudgetService`：统一维护 batch、final、global 三层预算。
- 新增 `AiTextCompressor`：文本清洗、长文本截断、列表限量、重复 URL/重复产品压缩。
- 新增 `AiBatchPlanner`：把超预算 group 拆成多个 batch。
- 所有预算常量只在通用层定义，业务模块只能引用，不能各自散落一套阈值。

验收：

- 单个 batch input 不超过 18,000 字符。
- final report input 不超过 20,000 字符。
- 所有 AI 用户输入永远不超过 30,000 字符。
- 超过 18,000 字符时能触发再次压缩或分组摘要。

#### 1.2 通用 AI 调用保护

开发项：

- 新增 `AiRetryService`：处理超时、429、5xx、网络错误、空 content、非 JSON 修复重试。
- 新增 `AiJsonGuard`：提取 JSON、校验 schema、校验 sourceId、返回 `ParseResult`。
- 新增 `AiStructuredSummarizer`：统一封装 batch summary、group merge、final report 调用。
- 如 `AiProviderService.complete()` 暂时不能返回 `finish_reason`，先在文档和代码注释中标记 provider 能力缺口，后续再补输出截断识别。

验收：

- AI 第一次超时，第二次成功，最终分析成功。
- AI 返回空内容或非 JSON，会触发重试。
- API key 错误、权限错误、模型不存在不重试。
- 非 JSON 最终仍失败时，不标记为 AI 成功。

#### 1.3 官网分析最小接入

开发项：

- 建立 `sourceId` 证据索引。
- 建立 `WebsiteEvidenceGrouper`，使用确定性规则输出 `EvidenceGroupAssignment`。
- 官网分析最终报告输入必须来自 `groupSummaries` 或轻量 whole-site group，不直接读取完整原始页面。
- `generateAiInsights()` 返回 `{ aiInsights, errorMessage, aiMeta, summaryPipeline }`。
- `persistCrawlerResult()` 保存原始抓取数据、`sourceEvidence`、`summaryPipeline`、`aiMeta`。

验收：

- 抓取成功、AI 连续失败时，官网分析仍保存 pages/products/contacts。
- 分组输出中的来源都能映射回原始 URL。
- 某个分组失败时，其他分组仍然参与最终报告。
- 最终报告输入只来自 group summaries。

#### 1.4 背调报告最小接入

开发项：

- 保留现有 `RESEARCH_PROMPT_MAX_CHARS = 12_000` 和多档裁剪能力。
- 新增背调证据 `sourceId` 标准化。
- 把客户资料、官网分析、搜索结果、企业资料库、联系人、历史跟进按业务意义分组。
- 背调最终报告只读取结构化 group summaries。
- `sourceEvidence` 必须保存真实来源数组。

验收：

- 背调报告来源不再为空。
- 搜索结果和官网分析数据很多时，仍能生成 8 个固定结构。
- 某个来源组失败时，不影响其他来源组进入最终报告。

#### 1.5 前端提示和回归测试

开发项：

- 前端根据 `analysis.status` 和 `aiMeta.status` 区分抓取失败、AI 部分失败、AI 跳过、AI 完整成功。
- 黄色 warning 显示 AI 总结失败或部分失败，不把抓取成功误判为整体失败。
- 技术明细展示 `sourceEvidence`、`summaryPipeline.groups`、失败原因。

验收：

- 前端能区分“官网抓取失败”和“AI 总结失败”。
- 有来源依据时能展示链接。
- 没有来源依据时显示明确空状态，不误导用户。

### 第二阶段：官网分析完整分组总结

目标：提高大官网的信息完整度，减少一刀切裁剪。

开发项：

- 建立 `sourceId` 证据索引。
- 建立分组构建器。
- 建立 batch summary prompt。
- 建立 final synthesis prompt。
- 校验 AI 返回的 sourceId。
- 保存 batch 统计到 `aiMeta`。

验收：

- 大型官网不会因为输入过长直接失败。
- 分组输出中的来源都能映射回原始 URL。
- 某个分组失败时，其他分组仍然参与最终报告。
- 成本不超过设定最大分组数。

### 第三阶段：背调报告完整分组总结

目标：让背调报告稳定处理更大的输入，并保证 8 个固定结构和来源依据都能输出。

开发项：

- 背调证据 sourceId 标准化。
- 背调分组摘要。
- 最终背调报告合成。
- `sourceEvidence` 保存真实来源数组。

验收：

- 背调报告来源不再为空。
- 大客户、多搜索结果、多官网页面时也能生成报告。
- 报告 8 个固定结构稳定输出。

## 14. 测试策略

### 14.1 预算测试

需要覆盖：

- 10 页、30 页、100 页官网数据分别进入流水线。
- 单个 batch input `<= 18_000`。
- final report input `<= 20_000`。
- 任意 AI 用户输入绝不超过 `30_000`。
- 超过警戒线时触发压缩、分 batch 或跳过低价值组。
- `chooseAiMode()` 能正确选择 DIRECT、BATCH_SUMMARY、SKIPPED。

### 14.2 分组测试

构造以下页面和证据：

- 首页。
- 产品详情页。
- 产品列表页。
- 联系我们页。
- 关于我们页。
- FAQ、隐私政策、条款页。
- 同时包含品牌、产品、联系方式的混合型首页。

需要验证：

- `primaryGroup` 正确。
- `confidence` 合理。
- `reasons` 能解释分组依据。
- 低置信度页面进入 `uncertain`。
- 产品组为空但 `result.products` 有数据时，会构造产品兜底组。
- 联系方式组为空但 `contacts` 有数据时，会构造联系方式兜底组。
- `validateSourceIds()` 会丢弃不存在的 sourceId。

### 14.3 降级测试

需要覆盖：

- 抓取失败时，分析状态 FAILED。
- 抓取成功、AI 成功时，分析状态 SUCCEEDED。
- 某个 batch AI 失败时，其他 batch 继续执行。
- 某个 group AI 失败时，使用规则摘要兜底。
- 最终报告 AI 返回非 JSON 时，保存 group summaries 并展示 partial warning。
- AI 超时、429、网络错误会重试。
- AI 连续失败时，官网抓取数据仍然保存。
- 资料库为空时，不影响官网分析或背调报告流程。
- 极端输入触发 minimal 或 skipped 时，仍然记录原因和来源明细。

### 14.4 解析和来源测试

需要覆盖：

- `parseWebsiteAiInsights()` 对合法 JSON 成功。
- `parseWebsiteAiInsights()` 对非 JSON 返回失败结果。
- AI 返回半损 JSON 时，能逐字段 fallback。
- AI 编造不存在的 `sourceId` 时，该条结论被丢弃。
- 输出 `sourceEvidence` 中的 URL、产品、联系方式能回溯到原始记录。

### 14.5 成本测试

需要覆盖：

- 10 页官网走直接总结或少量 batch。
- 30 页官网调用次数不超过普通官网预算。
- 100 页官网调用次数不超过大官网预算。
- 重复运行时缓存命中，不重复生成相同 batch summary。
- 达到最大调用次数后，剩余组进入 `skipped` 或规则 fallback。

### 14.6 前端测试

需要覆盖：

- 完整 AI 报告展示。
- AI 失败 warning 展示。
- AI 跳过 warning 展示。
- AI 部分成功 warning 展示。
- 有来源依据时展示链接。
- 没有来源依据时显示明确空状态，不误导用户。

## 15. 第一阶段最小落地改动清单

如果现在要马上落地，第一阶段按下面顺序提交，便于每一步单独验证：

1. 通用类型和预算常量：
   - 新增 `AiGenerationMeta`、`SummaryPipelineMeta`、`ParseResult`、`EvidenceGroupAssignment`。
   - 新增 batch/final/global 三层预算常量。
   - 验证所有预算测试通过。
2. 通用重试和 JSON 守卫：
   - 新增 `AiRetryService`。
   - 新增 `AiJsonGuard`。
   - 把非 JSON、空 content、关键字段缺失从“静默 fallback”改成可重试错误。
3. 通用压缩和 batch 规划：
   - 新增 `AiTextCompressor`。
   - 新增 `AiBatchPlanner`。
   - 新增 `AiSummaryMerger`。
   - 验证 batch input、final input、global input 都不会超限。
4. 官网分析最小分组接入：
   - 新增 `WebsiteEvidenceGrouper`。
   - 新增 `sourceId` 索引和校验。
   - 修改 `generateAiInsights()`，让最终报告输入来自 group summaries。
   - 修改 `persistCrawlerResult()`，保存 `aiMeta`、`summaryPipeline`、`sourceEvidence`。
5. 背调报告最小分组接入：
   - 新增 `ResearchEvidenceGrouper` 或在现有 builder 中补证据分组。
   - 保留现有背调裁剪上限，但最终报告输入改成 group summaries。
   - 保存 `sourceEvidence`，避免报告没有来源。
6. 前端状态展示：
   - 读取 `rawResult.aiMeta.status` 和 `rawResult.summaryPipeline`。
   - 区分抓取失败、AI 部分失败、AI 跳过、完整成功。
7. 回归测试：
   - 跑预算测试、分组测试、降级测试、来源测试、成本测试、前端状态测试。

第一阶段完成后，官网分析和背调报告都应该具备同一套稳定底座：原始数据完整保存，AI 输入受预算约束，局部失败不会拖垮整体报告，最终结论尽量带来源。

## 16. 后续判断标准

第一阶段上线后重点观察：

- `summaryPipeline.status` 中 `failed` 和 `fallback` 的比例。
- 大官网是否频繁触发 `skipped`。
- 背调报告是否仍然出现来源为空。
- final report input 是否经常接近 20,000 字符硬上限。
- LLM 调用次数是否超过普通官网 4 到 6 次、大官网 8 到 10 次的预算。
- 用户是否认为报告信息不足或来源不可信。

如果这些指标仍然不稳定，再进入第二阶段和第三阶段深化：

- 官网分析：优化分组规则、sourceId 引用、产品和机会识别。
- 背调报告：优化公开搜索、企业资料库、联系人、历史跟进的证据分组。
- 成本控制：把缓存从 `rawResult` 升级到独立表，支持跨任务复用。
- 可观测性：增加 fallback 率、重试率、输入长度分布、调用次数分布的日志或指标。

## 17. 完整开发执行计划

本章用于真正落地开发。前面的章节说明“为什么这样做”和“目标架构是什么”，本章说明“按什么顺序改、每一步改哪些文件、怎么验证”。

执行原则：

- 每个任务单独提交，方便回滚和 code review。
- 第一版不强制改 Prisma schema，优先把 `aiMeta`、`summaryPipeline`、`sourceEvidence` 写入现有 `rawResult`。
- 官网分析和背调报告共用 AI 稳定底座，但业务分组规则分别实现。
- 每一步都先保证旧功能可用，再扩大到下一层能力。
- 不把完整原始页面、完整搜索结果、完整历史跟进直接塞进最终报告 prompt。

### 17.1 基线检查与 provider 能力确认

**目标**

确认现有 AI provider、官网分析、背调报告的真实接口能力，避免后续计划建立在错误假设上。

**涉及文件**

- 读取：`apps/api/src/modules/ai/ai-provider.service.ts`
- 读取：`apps/api/src/modules/website-analysis/website-analysis.processor.ts`
- 读取：`apps/api/src/modules/research/research.processor.ts`
- 读取：`apps/api/src/modules/research/builders/research-prompt-builder.ts`
- 读取：`apps/api/src/modules/research/parsers/research-output-parser.ts`

**实现步骤**

1. 确认 `AiProviderService.complete()` 当前返回值：
   - 已有：`content`
   - 已有：`raw`
   - 已有：`tokenUsage`
   - 缺少：明确的 `finishReason`
   - 缺少：HTTP status、provider error code、retry-after 的结构化返回
2. 确认官网分析当前 AI 入口：
   - `WebsiteAnalysisProcessor.generateAiInsights()`
   - 当前直接调用 `aiProvider.complete()`
   - 当前 `parseWebsiteAiInsights()` 非 JSON 时走 fallback，不返回失败状态
3. 确认背调报告当前 AI 入口：
   - `ResearchProcessor.process()`
   - 当前 AI 失败会直接 `persistFailure`
   - 当前已有 `buildResearchPromptUserInput()` 和裁剪逻辑，但没有 retry/fallback/meta

**验收标准**

- 明确记录 `finishReason` 需要后续 provider 层补充，第一版先不依赖它。
- 明确官网分析和背调报告各自的 AI 调用入口。
- 明确第一版不改数据库表结构，先使用 `rawResult` / report JSON 兼容存储。

**建议提交**

本任务只做检查，不需要提交。

### 17.2 通用 AI 类型、预算常量和错误枚举

**目标**

先建立所有业务共用的类型和预算常量，避免官网分析、背调报告各自散落一套阈值。

**涉及文件**

- 新增：`apps/api/src/modules/ai/ai-generation.types.ts`
- 新增：`apps/api/src/modules/ai/ai-budget.service.ts`
- 修改：`apps/api/src/modules/ai/ai.module.ts`
- 修改：`apps/api/src/modules/ai/ai.public.ts`

**新增类型**

```ts
export type AiGenerationMode = "DIRECT" | "BATCH_SUMMARY" | "FALLBACK" | "SKIPPED";

export type AiGenerationStatus = "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";

export type AiErrorKind =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "NETWORK"
  | "INVALID_JSON"
  | "EMPTY_RESPONSE"
  | "INPUT_TOO_LARGE"
  | "AUTH"
  | "PROVIDER_ERROR"
  | "UNKNOWN";

export type AiGenerationMeta = {
  mode: AiGenerationMode;
  status: AiGenerationStatus;
  inputChars: number;
  estimatedInputTokens?: number;
  attemptCount: number;
  retryCount: number;
  durationMs?: number;
  errorKind?: AiErrorKind;
  errorMessage?: string;
};

export type ParseResult<T> =
  | { ok: true; data: T; warnings: string[] }
  | { ok: false; fallback: T; reason: AiErrorKind | string; warnings: string[] };

export type SummaryPipelineGroupStatus = "succeeded" | "partial_succeeded" | "fallback" | "failed" | "skipped";

export type SummaryPipelineMeta = {
  status: SummaryPipelineGroupStatus;
  mode: AiGenerationMode;
  inputChars: number;
  finalInputChars?: number;
  attemptCount: number;
  retryCount: number;
  groups: Record<string, {
    status: SummaryPipelineGroupStatus;
    batchCount: number;
    failedBatchCount: number;
    sourceCount: number;
  }>;
  errors: Array<{
    scope: "provider" | "parser" | "batch" | "group" | "final";
    groupName?: string;
    batchId?: string;
    errorKind: AiErrorKind;
    message: string;
  }>;
};
```

**预算常量**

```ts
export const AI_BATCH_TARGET_CHARS = 12_000;
export const AI_BATCH_WARNING_CHARS = 14_000;
export const AI_BATCH_HARD_LIMIT_CHARS = 18_000;
export const AI_FINAL_TARGET_CHARS = 16_000;
export const AI_FINAL_WARNING_CHARS = 18_000;
export const AI_FINAL_HARD_LIMIT_CHARS = 20_000;
export const AI_GLOBAL_HARD_LIMIT_CHARS = 30_000;
```

**实现步骤**

1. 新增 `ai-generation.types.ts`，放通用类型。
2. 新增 `AiBudgetService`：
   - `measure(input: unknown): { chars: number; estimatedTokens: number }`
   - `assertGlobalLimit(input: unknown): void`
   - `isFinalInputTooLarge(input: unknown): boolean`
   - `isBatchInputTooLarge(input: unknown): boolean`
3. 在 `AiModule` providers/exports 中导出 `AiBudgetService`。
4. 在 `ai.public.ts` 导出类型和 service。

**测试步骤**

- 新增轻量 spec：`apps/api/src/modules/ai/ai-budget.service.spec.ts`
- 覆盖：
  - 字符统计稳定。
  - 30,000 字符以上触发 global limit。
  - 20,000 字符以上触发 final hard limit。
  - 18,000 字符以上触发 batch hard limit。

**验收命令**

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-budget.service.spec.ts
npm run lint
```

**建议提交**

```bash
git add apps/api/src/modules/ai
git commit -m "feat(api): add shared ai budget types"
```

### 17.3 通用 AI 重试和 JSON 守卫

**目标**

把 429、超时、网络抖动、空内容、非 JSON 与永久错误区分开，避免一次瞬态失败直接变成 fallback。

**涉及文件**

- 新增：`apps/api/src/modules/ai/ai-retry.service.ts`
- 新增：`apps/api/src/modules/ai/ai-json-guard.ts`
- 修改：`apps/api/src/modules/ai/ai-provider.service.ts`
- 修改：`apps/api/src/modules/ai/ai.module.ts`
- 修改：`apps/api/src/modules/ai/ai.public.ts`

**实现步骤**

1. 新增 `AiRetryService.completeWithRetry(input, options)`。
2. 错误分类：
   - 可重试：`TIMEOUT`、`RATE_LIMIT`、`NETWORK`、`PROVIDER_ERROR`、`EMPTY_RESPONSE`、`INVALID_JSON`
   - 不重试：`AUTH`、模型不存在、余额/权限类错误、输入硬超长
3. 对 429 支持 `Retry-After`：
   - 第一版如果 provider 还没有结构化 status，就先从异常 message 中保守识别。
   - 后续再把 `AiProviderService.complete()` 返回结构升级为带 `status` 和 `finishReason`。
4. 新增 `AiJsonGuard`：
   - `parseObject(content: string)`
   - `parseWithFallback<T>(content, fallback, normalize)`
   - `validateSourceIds(sourceIds, sourceIndex)`
5. `AiJsonGuard` 不直接理解官网分析或背调业务，只负责 JSON 和来源 ID 的通用校验。

**测试步骤**

- 新增：`apps/api/src/modules/ai/ai-retry.service.spec.ts`
- 新增：`apps/api/src/modules/ai/ai-json-guard.spec.ts`
- 覆盖：
  - 第一次 timeout，第二次成功。
  - 429 会重试。
  - AUTH 错误不重试。
  - 空 content 会转成 `EMPTY_RESPONSE`。
  - 非 JSON 返回 `ParseResult.ok=false`。
  - 不存在的 `sourceId` 会被过滤并返回 warning。

**验收命令**

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-retry.service.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-json-guard.spec.ts
npm run lint
```

**建议提交**

```bash
git add apps/api/src/modules/ai
git commit -m "feat(api): add ai retry and json guard"
```

### 17.4 通用压缩、分批和摘要合并工具

**目标**

把“裁剪、分 batch、合并摘要”做成共用能力，官网分析和背调报告都能复用。

**涉及文件**

- 新增：`apps/api/src/modules/ai/ai-text-compressor.ts`
- 新增：`apps/api/src/modules/ai/ai-batch-planner.ts`
- 新增：`apps/api/src/modules/ai/ai-summary-merger.ts`
- 修改：`apps/api/src/modules/ai/ai.module.ts`
- 修改：`apps/api/src/modules/ai/ai.public.ts`

**实现步骤**

1. `AiTextCompressor` 提供：
   - `truncateText(text, maxChars)`
   - `limitList(list, maxItems, score?)`
   - `dedupeByKey(list, getKey)`
   - `compressFinalInput(groupSummaries, budget)`
2. `AiBatchPlanner` 提供：
   - `plan(items, options): AiBatch[]`
   - 保证单 batch 不超过 `AI_BATCH_HARD_LIMIT_CHARS`
   - 超限时优先降低长文本字段，再拆 batch
3. `AiSummaryMerger` 提供：
   - `mergeBatchSummaries(batchSummaries, groupName, ruleFallback)`
   - 输出长度必须小于 batch summaries 总和
   - 没有 AI 摘要时返回 rule fallback

**测试步骤**

- 新增：`apps/api/src/modules/ai/ai-text-compressor.spec.ts`
- 新增：`apps/api/src/modules/ai/ai-batch-planner.spec.ts`
- 新增：`apps/api/src/modules/ai/ai-summary-merger.spec.ts`
- 覆盖：
  - 超长文本会被截断。
  - 重复 URL/重复产品会被去重。
  - 100 条证据会被拆成多个 batch。
  - 每个 batch 不超过 18,000 字符。
  - final input 不超过 20,000 字符。

**验收命令**

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-text-compressor.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-batch-planner.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-summary-merger.spec.ts
npm run lint
```

**建议提交**

```bash
git add apps/api/src/modules/ai
git commit -m "feat(api): add ai input compression pipeline"
```

### 17.5 官网分析 sourceId 和证据分组

**目标**

让官网分析的每个 AI 结论都能追溯到页面、产品或联系方式，且分组不依赖 LLM 猜测。

**涉及文件**

- 新增：`apps/api/src/modules/website-analysis/builders/website-evidence-inventory.builder.ts`
- 新增：`apps/api/src/modules/website-analysis/builders/website-evidence-grouper.ts`
- 新增：`apps/api/src/modules/website-analysis/builders/website-evidence-grouper.spec.ts`
- 修改：`apps/api/src/modules/website-analysis/website-analysis.types.ts`

**实现步骤**

1. 新增 `WebsiteEvidenceItem`：
   - `page:${index}`
   - `product:${index}`
   - `contact:${index}`
2. 新增 `buildWebsiteEvidenceInventory(result)`：
   - 从 `result.pages` 生成 page evidence。
   - 从 `result.products` 生成 product evidence。
   - 从 `result.contacts` 生成 contact evidence。
3. 新增 `WebsiteEvidenceGrouper`：
   - `brand_about`
   - `product_catalog`
   - `contact_channel`
   - `price_region`
   - `oem_opportunity`
   - `risk_signal`
   - `uncertain`
4. 分组必须返回：
   - `primaryGroup`
   - `groups`
   - `confidence`
   - `reasons`
   - `selectedForAi`
5. 兜底：
   - 产品组为空但 `result.products` 有数据，构造产品兜底组。
   - 联系组为空但 `result.contacts` 有数据，构造联系方式兜底组。

**测试步骤**

- 构造首页、关于页、产品页、联系页、FAQ/隐私页、混合首页。
- 验证：
  - 产品页进入 `product_catalog`。
  - 联系页进入 `contact_channel`。
  - 低价值/低置信度页面进入 `uncertain`。
  - 每个 group 的 `sourceId` 都能在 source index 找到。

**验收命令**

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/website-analysis/builders/website-evidence-grouper.spec.ts
npm run lint
```

**建议提交**

```bash
git add apps/api/src/modules/website-analysis
git commit -m "feat(api): add website evidence grouping"
```

### 17.6 官网分析 AI 输入与解析改造

**目标**

把官网分析从“直接塞 bounded input”升级为“直接总结或分组摘要”，并让非 JSON 不再静默成功。

**涉及文件**

- 修改：`apps/api/src/modules/website-analysis/builders/website-ai-input.builder.ts`
- 新增：`apps/api/src/modules/website-analysis/builders/website-ai-batch-input.builder.ts`
- 新增：`apps/api/src/modules/website-analysis/parsers/website-ai-insight.parser.ts`
- 修改：`apps/api/src/modules/website-analysis/website-analysis.processor.ts`
- 修改：`apps/api/src/modules/website-analysis/website-analysis.module.ts`

**实现步骤**

1. 保留现有 `buildBoundedWebsiteAiInput()`，作为小官网和分组失败兜底。
2. 新增 `buildWebsiteAiBatchInput(group, companyProfile)`。
3. 把 `parseWebsiteAiInsights()` 从 processor 中移入 parser 文件。
4. 解析函数改成 `ParseResult<WebsiteAiInsights>`：
   - 合法 JSON：`ok=true`
   - 非 JSON：`ok=false, reason="INVALID_JSON"`
   - 关键字段缺失：`ok=false, reason="MISSING_REQUIRED_FIELDS"`
   - 非关键字段缺失：字段级 fallback + warnings
5. `WebsiteAnalysisProcessor.generateAiInsights()` 改为：
   - 构建 evidence inventory。
   - 尝试 direct input。
   - `<= 16,000` 字符走 direct。
   - `> 18,000` 字符走 batch summary。
   - `> 30,000` 且无法分组时跳过 AI。
6. AI 调用统一走 `AiRetryService`。
7. 返回 `{ aiInsights, errorMessage, aiMeta, summaryPipeline, sourceEvidence }`。

**测试步骤**

- 更新：`apps/api/src/modules/website-analysis/builders/website-ai-input.builder.spec.ts`
- 更新：`apps/api/src/modules/website-analysis/website-analysis.processor.spec.ts`
- 新增 parser spec：
  - `apps/api/src/modules/website-analysis/parsers/website-ai-insight.parser.spec.ts`
- 覆盖：
  - 非 JSON 不再被当成成功。
  - AI 第一次失败第二次成功。
  - AI 连续失败时 fallback，但抓取数据仍保存。
  - final input 不读取完整原始 pages。

**验收命令**

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/website-analysis/builders/website-ai-input.builder.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/website-analysis/parsers/website-ai-insight.parser.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/website-analysis/website-analysis.processor.spec.ts
npm run lint
```

**建议提交**

```bash
git add apps/api/src/modules/website-analysis
git commit -m "feat(api): stabilize website ai generation"
```

### 17.7 官网分析持久化与前端状态展示

**目标**

官网抓取成功但 AI 总结失败时，后端保存完整抓取结果，前端显示 warning，而不是误判为整体失败。

**涉及文件**

- 修改：`apps/api/src/modules/website-analysis/website-analysis.processor.ts`
- 修改：`apps/api/src/modules/website-analysis/website-analysis.service.ts`
- 修改：`apps/web/src/features/customers/detail/panels/WebsiteAnalysisPanel.tsx`

**后端实现步骤**

1. `persistCrawlerResult()` 参数改为接收完整 `aiOutcome`。
2. `rawResult` 保存：
   - `aiInsights`
   - `aiInsightError`
   - `aiMeta`
   - `summaryPipeline`
   - `sourceEvidence`
3. 不再把非致命 AI 错误写入 `WebsiteAnalysis.errorMessage`。
4. `WebsiteAnalysis.status` 只表达抓取任务状态：
   - 抓取失败：`FAILED`
   - 抓取成功：`SUCCEEDED`
5. AI 质量状态交给 `rawResult.aiMeta.status`。

**前端实现步骤**

1. 从 `analysis.rawResult.aiMeta.status` 读取 AI 状态。
2. 展示状态：
   - `SUCCEEDED`：完整 AI 分析。
   - `PARTIAL`：黄色提示，展示已成功分组和基础分析。
   - `FAILED`：黄色提示，展示抓取数据和 fallback。
   - `SKIPPED`：黄色提示，说明因输入过大或信息量不足跳过 AI。
3. 来源展示：
   - 有 `sourceEvidence.pages` 时展示页面链接。
   - 有 `sourceEvidence.products` 时展示产品来源。
   - 没有来源时展示明确空状态。

**测试步骤**

- 后端 processor spec 覆盖：
  - AI 失败但 `WebsiteAnalysis.status=SUCCEEDED`。
  - `rawResult.aiMeta.status=FAILED`。
  - `errorMessage` 不再保存非致命 AI 错误。
- 前端至少跑类型检查：

```bash
npm run lint -w @oem-crm/web
```

**验收命令**

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/website-analysis/website-analysis.processor.spec.ts
npm run lint
cd ../..
npm run lint -w @oem-crm/web
```

**建议提交**

```bash
git add apps/api/src/modules/website-analysis apps/web/src/features/customers/detail/panels/WebsiteAnalysisPanel.tsx
git commit -m "feat: show partial website ai results"
```

### 17.8 背调报告 sourceId 和分组摘要接入

**目标**

背调报告不再直接吃所有上下文，而是把客户资料、官网分析、搜索结果、企业资料库、联系人、历史跟进拆成结构化证据组。

**涉及文件**

- 新增：`apps/api/src/modules/research/builders/research-evidence-grouper.ts`
- 新增：`apps/api/src/modules/research/builders/research-batch-input.builder.ts`
- 修改：`apps/api/src/modules/research/builders/research-context-builder.ts`
- 修改：`apps/api/src/modules/research/builders/research-prompt-builder.ts`
- 修改：`apps/api/src/modules/research/research.processor.ts`
- 修改：`apps/api/src/modules/research/research.module.ts`

**实现步骤**

1. 新增背调 evidence 类型：
   - `customer:${id}`
   - `website:${sourceId}`
   - `search:${index}`
   - `knowledge:${id}`
   - `contact:${id}`
   - `followup:${id}`
2. 分组：
   - `customer_profile`
   - `website_summary`
   - `public_search`
   - `product_fit`
   - `contact_signals`
   - `risks`
   - `opportunities`
   - `followup_context`
3. 保留现有 `RESEARCH_PROMPT_MAX_CHARS = 12_000`，但把它升级为每组或最终输入预算。
4. `ResearchProcessor.process()` 改为：
   - 构建 context。
   - 构建 evidence。
   - 分组和 batch。
   - 生成 group summaries。
   - final prompt 只读取 group summaries。
5. `sourceEvidence` 必须来自 evidence source index，不允许为空数组掩盖问题。

**测试步骤**

- 新增：`apps/api/src/modules/research/builders/research-evidence-grouper.spec.ts`
- 更新：`apps/api/src/modules/research/builders/research-context-builder.spec.ts`
- 覆盖：
  - 搜索结果多时会分组。
  - 官网分析来源能进入 `website_summary`。
  - 企业资料库产品能进入 `product_fit`。
  - final input 不超过 20,000 字符。
  - `sourceEvidence` 能回溯来源。

**验收命令**

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/research/builders/research-evidence-grouper.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/research/builders/research-context-builder.spec.ts
npm run lint
```

**建议提交**

```bash
git add apps/api/src/modules/research
git commit -m "feat(api): add research evidence grouping"
```

### 17.9 背调报告重试、降级和来源展示

**目标**

背调报告在部分来源或 AI 总结失败时不直接整体失败；如果无法生成最终报告，也要保存可用证据摘要和失败原因。

**涉及文件**

- 修改：`apps/api/src/modules/research/research.processor.ts`
- 修改：`apps/api/src/modules/research/services/research-report-run.service.ts`
- 修改：`apps/api/src/modules/research/parsers/research-output-parser.ts`
- 修改：`apps/web/src/features/customers/detail/panels/ResearchPanel.tsx`
- 修改：`apps/web/src/features/customers/detail/panels/research-source-evidence.ts`

**实现步骤**

1. `ResearchProcessor` AI 调用接入 `AiRetryService`。
2. `parseResearchOutput()` 改成可返回 `ParseResult` 或增加 wrapper：
   - 非 JSON：触发重试。
   - 关键 8 个板块缺失：触发重试或字段 fallback。
3. `ResearchReportRunService.persistSuccess()` 保存：
   - `aiMeta`
   - `summaryPipeline`
   - `sourceEvidence`
4. 如果最终 AI 失败：
   - 保存 group summaries。
   - 报告状态可以先按现有模型保守处理；若数据库不支持 partial，至少在失败记录里保留 `summaryPipeline`。
5. 前端展示：
   - 来源为空时显示“暂无可追溯来源”，不假装有来源。
   - 有 `sourceEvidence` 时按官网、搜索、资料库、联系人分组展示。

**测试步骤**

- research processor spec 如果当前没有，先新增轻量 spec：
  - `apps/api/src/modules/research/research.processor.spec.ts`
- 覆盖：
  - AI 超时后重试成功。
  - AI 连续失败时保存失败原因。
  - `sourceEvidence` 不为空时前端工具函数能正常分组。

**验收命令**

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/research/research.processor.spec.ts
npm run lint
cd ../..
npm run lint -w @oem-crm/web
```

**建议提交**

```bash
git add apps/api/src/modules/research apps/web/src/features/customers/detail/panels/ResearchPanel.tsx apps/web/src/features/customers/detail/panels/research-source-evidence.ts
git commit -m "feat: stabilize research report generation"
```

### 17.10 缓存和调用次数控制

**目标**

避免重复运行时重复生成相同 batch summary，并限制大官网或大背调上下文的调用成本。

**涉及文件**

- 新增：`apps/api/src/modules/ai/ai-summary-cache.service.ts`
- 修改：`apps/api/src/modules/ai/ai.module.ts`
- 修改：`apps/api/src/modules/ai/ai.public.ts`
- 修改：`apps/api/src/modules/website-analysis/website-analysis.processor.ts`
- 修改：`apps/api/src/modules/research/research.processor.ts`

**实现步骤**

1. 第一版缓存位置：
   - 官网分析：`WebsiteAnalysis.rawResult.summaryPipeline.cache`
   - 背调报告：如果现有 report JSON 可存扩展字段，则写入 report 结果 JSON；否则只做任务内 memory cache
2. 缓存 key：
   - `scopeId`
   - `groupName`
   - `batchIndex`
   - `contentHash`
   - `promptVersion`
3. 调用次数限制：
   - 小官网：1 到 2 次。
   - 普通官网：4 到 6 次。
   - 大官网：8 到 10 次。
   - 背调报告：按配置限制总调用次数。
4. 达到调用上限后：
   - 高价值组优先。
   - 低价值组进入 `skipped` 或规则 fallback。

**测试步骤**

- 新增：`apps/api/src/modules/ai/ai-summary-cache.service.spec.ts`
- 覆盖：
  - 同 contentHash + promptVersion 命中缓存。
  - promptVersion 变化不命中缓存。
  - 达到最大调用次数后跳过低价值组。

**验收命令**

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-summary-cache.service.spec.ts
npm run lint
```

**建议提交**

```bash
git add apps/api/src/modules/ai apps/api/src/modules/website-analysis apps/api/src/modules/research
git commit -m "feat(api): cache ai group summaries"
```

### 17.11 回归验收清单

**后端验收命令**

```bash
npm run lint -w @oem-crm/api
```

已存在或建议新增的手动 spec 命令：

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-budget.service.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-retry.service.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-json-guard.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/ai/ai-batch-planner.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/website-analysis/builders/website-ai-input.builder.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/website-analysis/builders/website-evidence-grouper.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/website-analysis/parsers/website-ai-insight.parser.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/website-analysis/website-analysis.processor.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/research/builders/research-context-builder.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/research/builders/research-evidence-grouper.spec.ts
npx ts-node -r tsconfig-paths/register src/modules/research/research.processor.spec.ts
```

**前端验收命令**

```bash
npm run lint -w @oem-crm/web
npm run build -w @oem-crm/web
```

**全仓验收命令**

```bash
npm run build
```

**人工验收场景**

1. 小官网：
   - 页面少、产品少。
   - 期望走 direct。
   - 报告完整生成。
2. 大官网：
   - 页面多、产品多。
   - 期望走 batch summary。
   - final input 不超过 20,000 字符。
3. AI 第一次超时：
   - 期望重试成功。
   - `aiMeta.retryCount > 0`。
4. AI 连续失败：
   - 官网分析状态仍为 `SUCCEEDED`。
   - 前端显示黄色 warning。
   - 页面、产品、联系方式仍可见。
5. 背调报告大输入：
   - 搜索结果、官网分析、资料库、联系人都存在。
   - 报告能输出 8 个固定结构。
   - `sourceEvidence` 不为空。

### 17.12 推荐提交顺序

建议按下面顺序合入，避免一次 PR 过大：

1. `feat(api): add shared ai budget types`
2. `feat(api): add ai retry and json guard`
3. `feat(api): add ai input compression pipeline`
4. `feat(api): add website evidence grouping`
5. `feat(api): stabilize website ai generation`
6. `feat: show partial website ai results`
7. `feat(api): add research evidence grouping`
8. `feat: stabilize research report generation`
9. `feat(api): cache ai group summaries`

每次提交前至少执行：

```bash
npm run lint -w @oem-crm/api
```

涉及前端时额外执行：

```bash
npm run lint -w @oem-crm/web
```
