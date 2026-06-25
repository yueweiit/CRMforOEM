import { MarkdownReport } from "../shared/Markdown";
import type { CustomerDetail, OemScore } from "../shared/types";
import { AnalysisSection, asArray, asRecord, getText, getNumber, stringifyInsight, InsightList, AiVersions, scoreLabel, gradeText } from "../shared/ui";
import { getOemScorePanelDisplayState } from "./oem-score-panel-state";

export function ScorePanel({ customer, isGenerating = false }: { customer: CustomerDetail; isGenerating?: boolean }) {
  const score = customer.oemFitScores[0];
  const strategy = asRecord(score?.developmentStrategy);
  const displayState = getOemScorePanelDisplayState({
    isGenerating,
    score: score ? { score: score.score, grade: score.grade } : undefined
  });
  return (
    <section className="panel">
      <div className="panel-title"><h2>OEM适配评分</h2><span>{displayState.titleStatus}</span></div>
      {displayState.showGeneratingNotice ? <div className="loading-state">OEM评分正在生成，完成后会自动刷新。</div> : null}
      {displayState.showEmptyState ? <div className="empty-state">尚未生成OEM评分。建议先完成官网分析和背调，再点击右上角"OEM评分"。</div> : null}
      {displayState.showExistingScore && score ? (
        <div className="page-stack">
          <div className="score-summary">
            <div className={`score-badge grade-${score.grade.toLowerCase()}`}>
              <strong>{score.score}</strong>
              <span>{score.grade}级 · {gradeText(score.grade)}</span>
            </div>
            <div>
              <h3>{getText(strategy, "summary") || "系统已生成OEM适配评分，请结合维度理由和推荐动作判断开发优先级。"}</h3>
              <p>生成时间：{new Date(score.createdAt).toLocaleString()}</p>
              {getText(strategy, "priority") ? <span className="status-pill">优先级：{getText(strategy, "priority")}</span> : null}
            </div>
          </div>

          <section className="analysis-section">
            <h3>维度评分</h3>
            <ScoreDimensionList score={score} />
          </section>

          <div className="analysis-grid">
            <AnalysisSection title="推荐供货产品">
              <RecommendedProductList items={score.recommendedProducts} />
            </AnalysisSection>
            <AnalysisSection title="邮件开发切入点">
              <InsightList items={score.emailEntryPoints} empty="暂无邮件切入点。" />
            </AnalysisSection>
            <AnalysisSection title="潜在合作机会">
              <InsightList items={score.opportunities} empty="暂无明确合作机会。" />
            </AnalysisSection>
            <AnalysisSection title="潜在风险">
              <InsightList items={score.risks} empty="暂无明显风险。" />
            </AnalysisSection>
            <AnalysisSection title="下一步行动">
              <InsightList items={score.nextActions} empty="暂无下一步行动建议。" />
            </AnalysisSection>
          </div>

          {score.explanation ? (
            <details className="ai-versions">
              <summary>评分报告原文</summary>
              <MarkdownReport content={score.explanation} />
            </details>
          ) : null}
          <AiVersions run={score.aiGenerationRun} />
        </div>
      ): null}
    </section>
  );
}

function ScoreDimensionList({ score }: { score: OemScore }) {
  const details = asArray(score.dimensionDetails);
  const weights = score.weights as Record<string, number> | undefined;
  const breakdown = score.breakdown as Record<string, number> | undefined;

  const resolveMaxScore = (key: string, rawMax: number) => {
    if (weights && typeof weights[key] === "number") return weights[key];
    if (rawMax > 0) return rawMax;
    return key === "riskPenalty" ? 10 : 15;
  };

  const resolveScore = (key: string, rawScore: number) => {
    if (breakdown && typeof breakdown[key] === "number") return breakdown[key];
    return rawScore;
  };

  const rows = details.length
    ? details.map((item) => {
        const record = asRecord(item);
        const key = getText(record, "key");
        const rawScore = getNumber(record, "score");
        const rawMax = getNumber(record, "maxScore");
        return {
          key,
          label: getText(record, "label") || scoreLabel(key),
          score: resolveScore(key, rawScore),
          maxScore: resolveMaxScore(key, rawMax),
          reason: getText(record, "reason"),
          evidence: asArray(record.evidence).map(stringifyInsight).filter(Boolean)
        };
      })
    : Object.entries(score.breakdown ?? {}).map(([key, value]) => ({
        key,
        label: scoreLabel(key),
        score: value,
        maxScore: resolveMaxScore(key, 0),
        reason: "",
        evidence: []
      }));
  return (
    <div className="score-dimensions">
      {rows.map((row) => {
        const percent = Math.max(0, Math.min(100, Math.round((row.score / Math.max(row.maxScore, 1)) * 100)));
        return (
          <div className="score-dimension" key={row.key || row.label}>
            <div>
              <strong>{row.label}</strong>
              <span>{row.reason || "系统根据客户资料、官网分析、背调和企业资料库自动评分。"}</span>
              {row.evidence.length ? <small>{row.evidence.slice(0, 3).join("；")}</small> : null}
            </div>
            <div className="score-meter">
              <span>{row.key === "riskPenalty" ? "-" : ""}{row.score}/{row.maxScore}</span>
              <i><b style={{ width: `${percent}%` }} /></i>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecommendedProductList({ items }: { items?: unknown }) {
  const products = asArray(items);
  if (!products.length) return <div className="empty-state">暂无推荐产品。请先完善企业资料库中的产品资料。</div>;
  return (
    <div className="analysis-list">
      {products.slice(0, 8).map((item, index) => {
        const record = asRecord(item);
        const name = getText(record, "name") || `推荐产品 ${index + 1}`;
        const category = getText(record, "category");
        const reason = getText(record, "reason") || getText(record, "description") || "建议人工复核匹配度。";
        const priceRange = getText(record, "priceRange");
        return (
          <div className="analysis-row" key={`${name}-${index}`}>
            <strong>{name}</strong>
            <span>{[category, priceRange].filter(Boolean).join(" · ") || "待补充品类/价格"}</span>
            <span>{reason}</span>
          </div>
        );
      })}
    </div>
  );
}
