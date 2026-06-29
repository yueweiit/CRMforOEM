import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import {
  AiProviderService,
  AiRetryService,
  AiBudgetService,
  AiTextCompressor,
  AiSummaryCache,
  AiRetryExhaustedError,
  AI_BATCH_TARGET_CHARS,
  AI_BATCH_HARD_LIMIT_CHARS,
  AI_FINAL_TARGET_CHARS,
  AI_FINAL_WARNING_CHARS,
  AI_FINAL_HARD_LIMIT_CHARS,
  AI_GLOBAL_HARD_LIMIT_CHARS
} from "../ai/ai.public";
import type { AiErrorKind, AiGenerationMeta, SummaryPipelineGroupStatus, SummaryPipelineMeta } from "../ai/ai.public";
import { RESEARCH_REPORT_QUEUE } from "./research.constants";
import { ResearchContextBuilder } from "./builders/research-context-builder";
import { ResearchReportRunService } from "./services/research-report-run.service";
import {
  buildResearchPromptUserInput,
  buildResearchPromptInput,
  compactResearchRunInput,
  researchSystemPrompt
} from "./builders/research-prompt-builder";
import { RESEARCH_PROMPT_BUDGETS } from "./research.constants";
import { buildMarkdownReportV2, parseResearchOutput } from "./parsers/research-output-parser";
import type { ResearchParsedOutput } from "./parsers/research-output-parser";
import {
  buildResearchEvidenceInventory,
  buildResearchGroups,
  type ResearchEvidenceGroup
} from "./builders/research-evidence-grouper";
import { compactResearchEvidenceItem } from "./builders/research-batch-input.builder";
import {
  RESEARCH_RECOMMENDATION_FIELDS,
  RESEARCH_SECTION_ORDER,
  RESEARCH_STRUCTURED_SECTION_SCHEMA,
  type ResearchSectionKey
} from "./research-report-schema";

type ResearchAiOutcome = {
  parsed: ResearchParsedOutput;
  aiMeta: AiGenerationMeta;
  summaryPipeline?: SummaryPipelineMeta;
  sourceEvidence: unknown;
  parseOk: boolean;
  errorMessage?: string;
};

@Processor(RESEARCH_REPORT_QUEUE)
export class ResearchProcessor extends WorkerHost {
  private readonly retry: AiRetryService;
  private readonly budget: AiBudgetService;
  private readonly compressor: AiTextCompressor;

  constructor(
    aiProvider: AiProviderService,
    private readonly cache: AiSummaryCache,
    private readonly contextBuilder: ResearchContextBuilder,
    private readonly reportRun: ResearchReportRunService
  ) {
    super();
    this.budget = new AiBudgetService();
    this.compressor = new AiTextCompressor();
    this.retry = new AiRetryService(aiProvider, this.budget);
  }

  async process(job: Job<{ reportId: string; organizationId: string; customerId: string; salesNotes?: string }>) {
    const { reportId, organizationId, customerId, salesNotes } = job.data;
    const report = await this.reportRun.markRunning(reportId);
    if (!report) return undefined;

    try {
      const context = await this.contextBuilder.build(organizationId, customerId, salesNotes);
      await this.reportRun.markAiRunRunning(report.aiGenerationRunId, compactResearchRunInput(context));

      const outcome = await this.generateAiInsights(context, organizationId, customerId);

      const completion = {
        raw: {},
        tokenUsage: undefined,
        content: JSON.stringify(outcome.parsed),
        durationMs: outcome.aiMeta.durationMs ?? 0
      };

      if (outcome.parseOk) {
        return this.reportRun.persistSuccess({
          reportId, customerId,
          aiGenerationRunId: report.aiGenerationRunId,
          parsed: outcome.parsed as Record<string, unknown> & { title: string; markdown_report: string },
          sourceEvidence: outcome.sourceEvidence,
          searchEnabled: context.publicSearch.enabled,
          aiMeta: outcome.aiMeta,
          summaryPipeline: outcome.summaryPipeline,
          completion
        });
      }

      // Parse failed but fallback data is available
      return this.reportRun.persistPartial({
        reportId, customerId,
        aiGenerationRunId: report.aiGenerationRunId,
        parsed: outcome.parsed as Record<string, unknown> & { title: string; markdown_report: string },
        sourceEvidence: outcome.sourceEvidence,
        searchEnabled: context.publicSearch.enabled,
        aiMeta: outcome.aiMeta,
        summaryPipeline: outcome.summaryPipeline,
        completion,
        errorMessage: outcome.errorMessage
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown research report error";
      await this.reportRun.persistFailure(reportId, report.aiGenerationRunId, message);
      throw error;
    }
  }

  private async generateAiInsights(
    context: Awaited<ReturnType<ResearchContextBuilder["build"]>>,
    organizationId: string,
    customerId: string
  ): Promise<ResearchAiOutcome> {
    const t0 = Date.now();
    const evidence = buildResearchEvidenceInventory(context);
    const groups = buildResearchGroups(evidence);
    const sourceEvidence = buildSourceEvidenceView(evidence, context);

    // Measure input size at the most generous budget tier to decide DIRECT vs BATCH_SUMMARY.
    // This is NOT the raw context size — it already has per-field caps from RESEARCH_PROMPT_BUDGETS[0].
    const budgetedInput = buildResearchPromptInput(context, RESEARCH_PROMPT_BUDGETS[0]);
    const budgetedInputChars = JSON.stringify(budgetedInput).length;

    // Build compressed input for DIRECT mode
    const directInput = buildResearchPromptUserInput(context);

    let mode: AiGenerationMeta["mode"] = "DIRECT";
    let errorKind: AiGenerationMeta["errorKind"];
    let errorMessage: string | undefined;
    let summaryPipeline: SummaryPipelineMeta | undefined;

    const cacheScope = `research:${organizationId}:${customerId}`;
    const cachePromptVersion = "research-report-v5";
    const maxCalls = this.cache.getMaxCalls(evidence.length, context.websiteSummary?.pages?.length ?? 0);

    try {
      // Mode selection based on uncompressed input size
      if (budgetedInputChars > AI_GLOBAL_HARD_LIMIT_CHARS && !groups.length) {
        mode = "SKIPPED";
        return {
          parsed: fallbackParsedOutput(context),
          aiMeta: {
            mode, status: "SKIPPED", inputChars: budgetedInputChars,
            estimatedInputTokens: Math.ceil(budgetedInputChars / 2),
            attemptCount: 0, retryCount: 0,
            durationMs: Date.now() - t0,
            errorKind: "INPUT_TOO_LARGE",
            errorMessage: "Research input exceeds global hard limit"
          },
          sourceEvidence,
          parseOk: false,
          errorMessage: "Research input exceeds global hard limit — AI skipped"
        };
      }

      if (budgetedInputChars <= AI_FINAL_WARNING_CHARS) {
        mode = "DIRECT";
      } else {
        mode = "BATCH_SUMMARY";
      }

      let completionContent: string;

      if (mode === "DIRECT") {
        const contentHash = this.cache.computeContentHash(directInput);
        const cacheKey = { scope: cacheScope, groupName: "direct", batchIndex: 0, contentHash, promptVersion: cachePromptVersion };

        const cached = this.cache.get(cacheKey);
        if (cached) {
          completionContent = cached;
        } else if (this.cache.canCall(cacheScope, maxCalls)) {
          const completion = await this.retry.completeWithRetry({
            system: researchSystemPrompt(),
            user: directInput,
            jsonMode: true
          });
          this.cache.recordCall(cacheScope);
          this.cache.set(cacheKey, completion.content);
          completionContent = completion.content;
        } else {
          return {
            parsed: fallbackParsedOutput(context),
            errorMessage: "AI call limit reached — using fallback",
            aiMeta: {
              mode: "FALLBACK", status: "SKIPPED", inputChars: budgetedInputChars,
              estimatedInputTokens: Math.ceil(budgetedInputChars / 2),
              attemptCount: 0, retryCount: 0,
              durationMs: Date.now() - t0,
              errorKind: "UNKNOWN",
              errorMessage: `Call limit ${maxCalls} reached for scope ${cacheScope}`
            },
            summaryPipeline: undefined,
            sourceEvidence,
            parseOk: false
          };
        }
      } else {
        // BATCH_SUMMARY: per-group summaries → merge → final report
        mode = "BATCH_SUMMARY";
        const perGroupPromptVersion = "research-per-group-v1";
        const groupMap: SummaryPipelineMeta["groups"] = {};
        const groupResults: Array<{
          groupName: string;
          status: SummaryPipelineGroupStatus;
          content: string;
          sourceCount: number;
        }> = [];
        const pipelineErrors: SummaryPipelineMeta["errors"] = [];
        let firstErrorKind: AiErrorKind | undefined;
        let firstErrorMessage: string | undefined;

        // Phase 1: Per-group summaries
        for (const group of groups) {
          const perGroupInput = buildPerGroupSummaryInput(group, context.customer.name);
          let perGroupPayload = JSON.stringify(perGroupInput);

          // Compress if group exceeds batch hard limit
          if (perGroupPayload.length > AI_BATCH_HARD_LIMIT_CHARS) {
            const compressedItems = this.compressor.compressFinalInput(
              perGroupInput.items as unknown[],
              { targetChars: AI_BATCH_TARGET_CHARS, hardLimitChars: AI_BATCH_HARD_LIMIT_CHARS }
            );
            perGroupInput.items = compressedItems as typeof perGroupInput.items;
            perGroupPayload = JSON.stringify(perGroupInput);
          }

          const contentHash = this.cache.computeContentHash(perGroupPayload);
          const cacheKey = {
            scope: cacheScope,
            groupName: group.groupName,
            batchIndex: 0,
            contentHash,
            promptVersion: perGroupPromptVersion
          };

          let groupSummaryContent: string;
          const cached = this.cache.get(cacheKey);
          if (cached) {
            groupSummaryContent = cached;
          } else if (this.cache.canCall(cacheScope, maxCalls)) {
            try {
              const completion = await this.retry.completeWithRetry({
                system: PER_GROUP_SUMMARY_SYSTEM_PROMPT,
                user: perGroupPayload,
                jsonMode: true
              });
              this.cache.recordCall(cacheScope);
              this.cache.set(cacheKey, completion.content);
              groupSummaryContent = completion.content;
            } catch (error) {
              if (!firstErrorKind && error instanceof AiRetryExhaustedError) {
                firstErrorKind = error.errorKind;
                firstErrorMessage = error.message;
              }
              groupMap[group.groupName] = {
                status: "failed",
                batchCount: 1,
                failedBatchCount: 1,
                sourceCount: group.sourceIds.length
              };
              pipelineErrors.push({
                scope: "group",
                groupName: group.groupName,
                errorKind: error instanceof AiRetryExhaustedError ? error.errorKind : "UNKNOWN",
                message: error instanceof Error ? error.message : String(error)
              });
              continue;
            }
          } else {
            groupMap[group.groupName] = {
              status: "skipped",
              batchCount: 0,
              failedBatchCount: 0,
              sourceCount: group.sourceIds.length
            };
            continue;
          }

          groupResults.push({
            groupName: group.groupName,
            status: "succeeded",
            content: groupSummaryContent,
            sourceCount: group.sourceIds.length
          });
          groupMap[group.groupName] = {
            status: "succeeded",
            batchCount: 1,
            failedBatchCount: 0,
            sourceCount: group.sourceIds.length
          };
        }

        // Phase 2: Build summaryPipeline from real per-group results
        const succeededResults = groupResults.filter((r) => r.status === "succeeded");
        const pipelineStatus: SummaryPipelineGroupStatus =
          succeededResults.length === groups.length ? "succeeded"
          : succeededResults.length > 0 ? "partial_succeeded"
          : "failed";

        summaryPipeline = {
          status: pipelineStatus,
          mode: "BATCH_SUMMARY",
          inputChars: budgetedInputChars,
          finalInputChars: 0,
          attemptCount: 1,
          retryCount: 0,
          groups: groupMap,
          errors: pipelineErrors
        };

        if (succeededResults.length === 0) {
          return {
            parsed: fallbackParsedOutput(context),
            aiMeta: {
              mode,
              status: "FAILED",
              inputChars: budgetedInputChars,
              estimatedInputTokens: Math.ceil(budgetedInputChars / 2),
              attemptCount: groups.length,
              retryCount: 0,
              durationMs: Date.now() - t0,
              errorKind: firstErrorKind ?? "UNKNOWN",
              errorMessage: firstErrorMessage ?? "All per-group summaries failed"
            },
            summaryPipeline,
            sourceEvidence,
            parseOk: false,
            errorMessage: "All per-group summaries failed — AI unavailable for all groups"
          };
        }

        // Build merged input from successful summaries
        const mergedInput = buildMergedSummaryInput(succeededResults, context.customer.name);
        let mergedPayload = JSON.stringify(mergedInput);

        // Compress merged input if exceeds final hard limit
        if (mergedPayload.length > AI_FINAL_HARD_LIMIT_CHARS) {
          mergedInput.groupSummaries = this.compressor.compressFinalInput(
            mergedInput.groupSummaries as unknown[],
            { targetChars: AI_FINAL_TARGET_CHARS, hardLimitChars: AI_FINAL_HARD_LIMIT_CHARS }
          ) as typeof mergedInput.groupSummaries;
          mergedPayload = JSON.stringify(mergedInput);
        }

        summaryPipeline.finalInputChars = mergedPayload.length;

        // Phase 3: Final AI call with merged summaries
        const finalContentHash = this.cache.computeContentHash(mergedPayload);
        const finalCacheKey = {
          scope: cacheScope,
          groupName: "final",
          batchIndex: 0,
          contentHash: finalContentHash,
          promptVersion: cachePromptVersion
        };

        const finalCached = this.cache.get(finalCacheKey);
        if (finalCached) {
          completionContent = finalCached;
        } else if (this.cache.canCall(cacheScope, maxCalls)) {
          const completion = await this.retry.completeWithRetry({
            system: researchSystemPrompt(),
            user: mergedPayload,
            jsonMode: true
          });
          this.cache.recordCall(cacheScope);
          this.cache.set(finalCacheKey, completion.content);
          completionContent = completion.content;
        } else {
          return {
            parsed: fallbackParsedOutput(context),
            errorMessage: "AI call limit reached — using fallback",
            aiMeta: {
              mode: "FALLBACK",
              status: "SKIPPED",
              inputChars: budgetedInputChars,
              estimatedInputTokens: Math.ceil(budgetedInputChars / 2),
              attemptCount: 0,
              retryCount: 0,
              durationMs: Date.now() - t0,
              errorKind: "UNKNOWN",
              errorMessage: `Call limit ${maxCalls} reached for scope ${cacheScope}`
            },
            summaryPipeline,
            sourceEvidence,
            parseOk: false
          };
        }
      }

      const parsed = parseResearchOutput(completionContent, context.customer.name, context.publicSearch.warning);

      if (parsed.ok) {
        return {
          parsed: parsed.data,
          aiMeta: {
            mode,
            status: "SUCCEEDED",
            inputChars: budgetedInputChars,
            estimatedInputTokens: Math.ceil(budgetedInputChars / 2),
            attemptCount: 1,
            retryCount: 0,
            durationMs: Date.now() - t0
          },
          summaryPipeline,
          sourceEvidence,
          parseOk: true
        };
      }

      // Parse failed — use fallback; keep per-group statuses intact
      errorKind = parsed.reason as AiGenerationMeta["errorKind"];
      errorMessage = parsed.warnings.join("; ") || `AI parse failed: ${parsed.reason}`;

      if (summaryPipeline) {
        summaryPipeline.status = "partial_succeeded";
        summaryPipeline.errors.push({
          scope: "final",
          errorKind: errorKind ?? "INVALID_JSON",
          message: errorMessage
        });
      }

      return {
        parsed: parsed.fallback,
        aiMeta: {
          mode,
          status: "FAILED",
          inputChars: budgetedInputChars,
          estimatedInputTokens: Math.ceil(budgetedInputChars / 2),
          attemptCount: 1,
          retryCount: 0,
          durationMs: Date.now() - t0,
          errorKind,
          errorMessage
        },
        summaryPipeline,
        sourceEvidence,
        parseOk: false,
        errorMessage
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI research error";
      const caughtErrorKind: AiGenerationMeta["errorKind"] =
        error instanceof AiRetryExhaustedError ? error.errorKind : errorKind;

      if (summaryPipeline) {
        summaryPipeline.status = "partial_succeeded";
        summaryPipeline.attemptCount = error instanceof AiRetryExhaustedError ? error.attemptCount : 1;
        summaryPipeline.retryCount = error instanceof AiRetryExhaustedError ? error.retryCount : 0;
        summaryPipeline.errors.push({
          scope: "provider",
          errorKind: caughtErrorKind ?? "UNKNOWN",
          message
        });
      }

      const actualAttempts = error instanceof AiRetryExhaustedError ? error.attemptCount : 1;
      const actualRetries = error instanceof AiRetryExhaustedError ? error.retryCount : 0;

      return {
        parsed: fallbackParsedOutput(context),
        aiMeta: {
          mode,
          status: "FAILED",
          inputChars: budgetedInputChars,
          estimatedInputTokens: Math.ceil(budgetedInputChars / 2),
          attemptCount: actualAttempts,
          retryCount: actualRetries,
          durationMs: Date.now() - t0,
          errorKind: caughtErrorKind,
          errorMessage: message
        },
        summaryPipeline,
        sourceEvidence,
        parseOk: false,
        errorMessage: toResearchUserFacingErrorMessage(caughtErrorKind ?? "UNKNOWN", message)
      };
    }
  }
}

// ── Per-group summary pipeline ──

const PER_GROUP_SUMMARY_SYSTEM_PROMPT = [
  "你是一名外贸OEM/ODM客户开发研究员。请根据以下证据组提取与该客户背调维度相关的关键事实。",
  "只输出严格 JSON 对象，不要包含解释、备注或代码块标记：",
  '{"summary": "该维度证据的关键事实总结（中文，200字以内）", "key_facts": ["从证据中提取的事实"], "missing": ["该维度明显缺失的信息"]}',
  "只从给定证据中提取，不要编造信息。如果证据不足以得出结论，在 missing 中说明。"
].join("\n");

function buildPerGroupSummaryInput(group: ResearchEvidenceGroup, customerName: string) {
  return {
    customerName,
    groupName: group.groupName,
    itemCount: group.items.length,
    items: group.items.map(compactResearchEvidenceItem)
  };
}

function buildMergedSummaryInput(
  succeededResults: Array<{ groupName: string; content: string; sourceCount: number }>,
  customerName: string
) {
  return {
    customerName,
    promptVersion: "research-report-v5",
    groupSummaries: succeededResults.map((r) => {
      let parsed: unknown;
      try { parsed = JSON.parse(r.content); } catch {
        const match = r.content.match(/\{[\s\S]*\}/);
        if (match) try { parsed = JSON.parse(match[0]); } catch { /* use raw */ }
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { groupName: r.groupName, sourceCount: r.sourceCount, ...(parsed as Record<string, unknown>) };
      }
      return { groupName: r.groupName, sourceCount: r.sourceCount, summary: r.content.slice(0, 800) };
    })
  };
}

function fallbackParsedOutput(context: { customer: { name: string }; publicSearch: { warning?: string } }): ResearchParsedOutput {
  const sections = buildFallbackResearchSections();
  return {
    title: `${context.customer.name} 客户背调报告`,
    sections,
    source_basis: [],
    markdown_report: buildMarkdownReportV2(context.customer.name, sections, context.publicSearch.warning)
  };
}

function buildFallbackResearchSections() {
  const sections: Record<string, unknown> = {};
  for (const key of RESEARCH_SECTION_ORDER) {
    if (key === "summary_development_recommendations") {
      sections[key] = emptyFallbackRecommendationSection();
      continue;
    }
    sections[key] = emptyFallbackStructuredSection(
      key,
      key === "company_basic_info" ? "AI 生成失败，请查看来源证据或重新生成。" : ""
    );
  }
  return sections;
}

function emptyFallbackStructuredSection(
  key: Exclude<ResearchSectionKey, "summary_development_recommendations">,
  analysis = ""
) {
  const section: Record<string, unknown> = {};
  for (const field of RESEARCH_STRUCTURED_SECTION_SCHEMA[key]) {
    section[field.key] = field.kind === "list" ? [] : "";
  }
  return { ...section, confirmed_facts: [], analysis, missing_info: [] };
}

function emptyFallbackRecommendationSection() {
  const section: Record<string, unknown> = {};
  for (const field of RESEARCH_RECOMMENDATION_FIELDS) {
    section[field.key] = field.kind === "list" ? [] : field.key.includes("rating") || field.key.includes("priority") ? "待评估" : "";
  }
  return section;
}

function buildSourceEvidenceView(
  evidence: ReturnType<typeof buildResearchEvidenceInventory>,
  context: { customer: { name: string; websiteUrl?: string | null; country?: string | null }; publicSearch: { enabled?: boolean; warning?: string }; contacts?: Array<unknown> }
) {
  return {
    customer: evidence
      .filter((e) => e.kind === "CUSTOMER_PROFILE")
      .map((e) => ({ sourceId: e.sourceId, name: e.name, websiteUrl: e.websiteUrl, country: e.country })),
    pages: evidence
      .filter((e) => e.kind === "WEBSITE_PAGE")
      .map((e) => ({ sourceId: e.sourceId, url: (e as { url: string }).url, title: (e as { title?: string | null }).title, pageType: (e as { pageType: string }).pageType })),
    products: evidence
      .filter((e) => e.kind === "WEBSITE_PRODUCT" || e.kind === "KNOWLEDGE_PRODUCT")
      .map((e) => ({ sourceId: e.sourceId, name: (e as { name: string }).name, category: (e as { category?: string | null }).category })),
    capabilities: evidence
      .filter((e) => e.kind === "KNOWLEDGE_CAPABILITY")
      .map((e) => ({ sourceId: e.sourceId, name: (e as { name: string }).name, category: (e as { category?: string | null }).category })),
    caseStudies: evidence
      .filter((e) => e.kind === "KNOWLEDGE_CASE_STUDY")
      .map((e) => ({ sourceId: e.sourceId, title: e.title, market: e.market, category: e.category })),
    contacts: evidence
      .filter((e) => e.kind === "CRM_CONTACT" || e.kind === "WEBSITE_CONTACT")
      .map((e) => {
        if (e.kind === "CRM_CONTACT") return { sourceId: e.sourceId, name: e.name, title: e.title, email: e.email };
        return { sourceId: e.sourceId, type: (e as { type: string }).type, value: (e as { value: string }).value };
      }),
    publicSearchResults: evidence
      .filter((e) => e.kind === "PUBLIC_SEARCH")
      .map((e) => ({ sourceId: e.sourceId, title: (e as { title?: string }).title, url: (e as { url?: string }).url })),
    followups: evidence
      .filter((e) => e.kind === "FOLLOWUP_TASK")
      .map((e) => ({ sourceId: e.sourceId, title: e.title, status: e.status, dueAt: e.dueAt })),
    searchEnabled: context.publicSearch.enabled,
    searchWarning: context.publicSearch.warning ?? null,
    contactCount: context.contacts?.length ?? 0,
    websiteUrls: evidence
      .filter((e) => e.kind === "WEBSITE_PAGE")
      .map((e) => (e as { url: string }).url)
      .slice(0, 12)
  };
}

function toResearchUserFacingErrorMessage(errorKind: AiErrorKind | string, rawMessage: string): string {
  if (errorKind === "NETWORK") return "无法连接到AI服务，请检查网络或稍后重试。";
  if (errorKind === "TIMEOUT") return "AI服务响应超时，请稍后重试。";
  if (errorKind === "AUTH") return "AI服务认证失败，请联系管理员。";
  if (errorKind === "RATE_LIMIT") return "AI服务请求过于频繁，请稍后重试。";
  return rawMessage;
}
