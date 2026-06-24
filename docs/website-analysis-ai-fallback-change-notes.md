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

- 直接总结模式：AI 用户输入建议控制在 20,000 到 24,000 字符以内。
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

### 4.1 分层结构

建议官网分析 AI 流程拆成以下组件：

```text
website-analysis/
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
```

如果暂时不想大改结构，可以先只新增：

- `website-ai-retry.service.ts`
- `website-ai-insight.parser.ts`
- `website-ai-budget.service.ts`

保留现有 processor，逐步迁移。

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
- 如果直接输入超过 24,000 字符，切换到分组总结。
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
  -> 标准化抓取结果并生成 sourceId
  -> 读取企业资料库产品和 OEM 能力
  -> 计算 AI 输入预算
  -> 选择 DIRECT 或 BATCH_SUMMARY
  -> 带重试调用 AI
  -> 解析和校验 AI JSON
  -> 保存抓取结果、AI 结果、来源依据和 aiMeta
  -> WebsiteAnalysis 标记 SUCCEEDED
```

### 5.2 sourceId 设计

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

1. 首页、关于、品牌、联系页为一组。
2. 产品列表页按分类分组。
3. 产品详情页按产品分类分组。
4. 价格信号单独合并到对应产品或分类分组。
5. 我方企业资料库产品和能力单独作为“我方供给能力组”。

### 6.2 分组示例

```ts
type WebsiteAiBatch = {
  batchId: string;
  batchType: "PROFILE" | "PRODUCT_CATEGORY" | "PRODUCT_DETAIL" | "PRICE" | "OUR_CAPABILITY";
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
| 最终归纳输入 | 20,000 到 24,000 字符 |
| 硬保护上限 | 30,000 字符 |

超过上限的内容不要丢失到数据库，只是不进入 AI 总结。

前端和报告中应提示：

```text
本次官网抓取数据较多，AI 已优先分析高价值页面和产品信息，完整抓取数据仍保存在技术明细中。
```

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

## 8. AI 输入预算策略

### 8.1 三层限制

建议使用三层预算：

1. 常规目标预算：24,000 字符。
2. 分组单次预算：12,000 到 16,000 字符。
3. 硬保护预算：30,000 字符。

伪代码：

```ts
const WEBSITE_AI_DIRECT_TARGET_CHARS = 24_000;
const WEBSITE_AI_BATCH_TARGET_CHARS = 14_000;
const WEBSITE_AI_HARD_LIMIT_CHARS = 30_000;

function measureAiInput(input: unknown) {
  const json = JSON.stringify(input);
  return {
    chars: json.length,
    estimatedTokens: Math.ceil(json.length / 2)
  };
}

function chooseAiMode(input: unknown, evidenceCount: number): "DIRECT" | "BATCH_SUMMARY" | "SKIPPED" {
  const size = measureAiInput(input);

  if (size.chars <= WEBSITE_AI_DIRECT_TARGET_CHARS) {
    return "DIRECT";
  }

  if (size.chars > WEBSITE_AI_HARD_LIMIT_CHARS) {
    return evidenceCount > 0 ? "BATCH_SUMMARY" : "SKIPPED";
  }

  if (evidenceCount > 0) {
    return "BATCH_SUMMARY";
  }

  return "DIRECT";
}
```

### 8.2 裁剪顺序

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

## 9. AI 生成编排伪代码

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

## 12. 对背调报告的复用方式

这个方案可以复用于背调报告。

建议抽一个通用的 AI 预算与分组摘要能力：

```text
common/ai-budget/
  ai-budget.service.ts
  ai-retry.service.ts
  ai-json-parser.ts

research/
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
  -> 按业务维度分组
  -> 分组摘要
  -> 最终报告合成
  -> 校验来源
  -> 保存报告和来源依据
```

## 13. 推荐开发阶段

### 第一阶段：补稳当前直接总结流程

目标：不引入分组总结，先解决当前最明显可靠性问题。

开发项：

- 新增 AI 重试。
- 解析函数返回 `ParseResult`，非 JSON 不再静默成功。
- 增加 `aiMeta`。
- 最小输入无价值或超硬上限时跳过 AI。
- 前端根据 `aiMeta.status` 展示 warning。

验收：

- AI 第一次超时，第二次成功，最终分析成功。
- AI 返回非 JSON，触发重试。
- AI 连续失败，官网抓取数据仍然保存。
- 前端能区分“官网抓取失败”和“AI 总结失败”。

### 第二阶段：引入分组总结

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

### 第三阶段：背调报告复用

目标：让背调报告也使用同一套预算、分组、来源校验能力。

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

### 14.1 单元测试

需要覆盖：

- `buildBoundedWebsiteAiInput()` 不超过硬上限。
- `chooseAiMode()` 能正确选择 DIRECT、BATCH_SUMMARY、SKIPPED。
- `parseWebsiteAiInsights()` 对合法 JSON 成功。
- `parseWebsiteAiInsights()` 对非 JSON 返回失败结果。
- `completeWithRetry()` 对临时错误重试。
- `completeWithRetry()` 对永久错误不重试。
- `validateSourceIds()` 会丢弃不存在的 sourceId。

### 14.2 处理器回归测试

需要覆盖：

- 抓取失败时，分析状态 FAILED。
- 抓取成功、AI 成功时，分析状态 SUCCEEDED。
- 抓取成功、AI 连续失败时，分析状态 SUCCEEDED，但 `aiMeta.status=FAILED`。
- 抓取成功、AI 跳过时，分析状态 SUCCEEDED，但 `aiMeta.status=SKIPPED`。
- 分组部分失败时，分析状态 SUCCEEDED，但 `aiMeta.status=PARTIAL`。

### 14.3 前端测试

需要覆盖：

- 完整 AI 报告展示。
- AI 失败 warning 展示。
- AI 跳过 warning 展示。
- 有来源依据时展示链接。
- 没有来源依据时显示明确空状态，不误导用户。

## 15. 第一阶段最小落地改动清单

如果现在要马上落地，建议先只做这些：

1. 新增 `WebsiteAiMeta` 类型。
2. 新增 `parseWebsiteAiInsightsResult()`，替代静默 fallback。
3. 新增 `completeWebsiteAiWithRetry()`。
4. 修改 `generateAiInsights()`：
   - 构建输入。
   - 判断预算。
   - 调用重试。
   - 解析校验。
   - 失败时 fallback。
   - 返回 `{ aiInsights, errorMessage, aiMeta }`。
5. 修改 `persistCrawlerResult()`，把 `aiMeta` 写进 `rawResult`。
6. 修改前端 `WebsiteAnalysisPanel`，读取 `rawResult.aiMeta.status`。
7. 增加 processor 和 parser 回归测试。

第一阶段完成后，系统即使还没有分组总结，也能明显减少“明明有数据但报告生成不了”的情况。

## 16. 后续判断标准

如果第一阶段上线后仍然出现：

- 大官网频繁 AI 失败。
- 30,000 字符裁剪导致产品和来源丢失明显。
- 用户认为报告太粗。
- 背调报告经常因为输入过多失败。

就进入第二阶段和第三阶段。

如果第一阶段已经足够稳定，可以暂缓分组总结，避免过早增加调用成本和代码复杂度。
