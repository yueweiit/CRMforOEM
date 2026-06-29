import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { Pencil, Trash2 } from "lucide-react";
import { AppSelect } from "../../../../components/AppSelect";
import { deleteOemFitScore, getOemFitScore, getOemFitScoreHistory, updateOemFitScore } from "../../../../api/customers";
import { MarkdownReport } from "../shared/Markdown";
import type { CustomerDetail, OemScore } from "../shared/types";
import { AnalysisSection, asArray, asRecord, getText, getNumber, stringifyInsight, InsightList, AiVersions, scoreLabel, gradeText, formatAnalysisTime } from "../shared/ui";
import { getAnalysisDetailLoadState, getDefaultAnalysisHistoryId, getNextAnalysisHistorySelection, sortAnalysisHistoryByCreatedAt } from "./analysis-history-state";
import { getOemScorePanelDisplayState } from "./oem-score-panel-state";

export function ScorePanel({ customer, customerId, isGenerating = false }: { customer: CustomerDetail; customerId: string; isGenerating?: boolean }) {
  const baseScores = customer.oemFitScores ?? [];
  const [historyRequested, setHistoryRequested] = useState(false);
  const historyQuery = useQuery({
    queryKey: ["customer", customerId, "oem-score-history"],
    queryFn: () => getOemFitScoreHistory(customerId),
    enabled: Boolean(historyRequested && customerId && localStorage.getItem("accessToken"))
  });
  const historyScores = historyQuery.data?.length ? historyQuery.data : baseScores;
  const scores = useMemo(() => sortAnalysisHistoryByCreatedAt(historyScores), [historyScores]);
  const defaultScoreId = useMemo(() => getDefaultAnalysisHistoryId(scores, canShowOemScore), [scores]);
  const [selectedScoreId, setSelectedScoreId] = useState(defaultScoreId);
  const [hasManualSelection, setHasManualSelection] = useState(false);

  useEffect(() => {
    const nextSelection = getNextAnalysisHistorySelection(scores, selectedScoreId, hasManualSelection, canShowOemScore);
    if (nextSelection !== selectedScoreId) {
      setSelectedScoreId(nextSelection);
      if (!scores.some((item) => item.id === selectedScoreId)) {
        setHasManualSelection(false);
      }
    }
  }, [scores, hasManualSelection, selectedScoreId]);

  const selectedBaseScore = baseScores.find((item) => item.id === selectedScoreId) ?? baseScores.find((item) => item.id === defaultScoreId) ?? baseScores[0];
  const shouldLoadScoreDetail = Boolean(selectedScoreId && selectedBaseScore?.id !== selectedScoreId);
  const selectedScoreQuery = useQuery({
    queryKey: ["customer", customerId, "oem-score", selectedScoreId],
    queryFn: () => getOemFitScore(customerId, selectedScoreId),
    enabled: shouldLoadScoreDetail
  });
  const score = selectedScoreQuery.data ?? selectedBaseScore ?? scores.find((item) => item.id === selectedScoreId) ?? scores.find((item) => item.id === defaultScoreId) ?? scores[0];
  const selectedDetailLoadState = getAnalysisDetailLoadState(shouldLoadScoreDetail, selectedScoreQuery);
  const isSelectedDetailLoading = selectedDetailLoadState === "loading";
  const effectiveScore = score?.manualScore ?? score?.score ?? 0;
  const effectiveGrade = score?.manualGrade ?? score?.grade ?? "";
  const strategy = asRecord(score?.developmentStrategy);
  const displayState = getOemScorePanelDisplayState({
    isGenerating: isGenerating && !score,
    score: score ? { score: score.score, grade: score.grade } : undefined
  });
  const selectorOptions = scores.map((item) => ({
    label: `${formatAnalysisTime(item.createdAt)} · ${item.score}分 ${item.grade}级`,
    value: item.id
  }));
  const requestHistory = () => setHistoryRequested(true);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteOemFitScore(customerId, score?.id ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId, "oem-score-history"] });
      setDeleteOpen(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { manualScore?: number; manualGrade?: string; manualNotes?: string }) =>
      updateOemFitScore(customerId, score?.id ?? "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId, "oem-score-history"] });
      setEditOpen(false);
    }
  });
  return (
    <section className="panel">
      <div className="panel-title analysis-history-title">
        <h2>OEM适配评分</h2>
        <div className="analysis-history-title__actions">
          {score ? (
            <>
              <div onFocus={requestHistory} onMouseDown={requestHistory}>
                <AppSelect
                  className="analysis-history-select"
                  value={score?.id ?? ""}
                  onChange={(value) => {
                    setSelectedScoreId(value);
                    setHasManualSelection(true);
                  }}
                  options={selectorOptions}
                  variant="toolbar"
                  title="历史OEM评分"
                />
              </div>
              <button className="icon-button" title="手动覆盖评分" onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
              </button>
              <button className="icon-button" title="删除评分" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={14} />
              </button>
            </>
          ) : null}
          <span>{displayState.titleStatus}</span>
        </div>
      </div>
      {displayState.showGeneratingNotice ? <div className="loading-state">OEM评分正在生成，完成后会自动刷新。</div> : null}
      {displayState.showEmptyState ? <div className="empty-state">尚未生成OEM评分。建议先完成官网分析和背调，再点击右上角"OEM评分"。</div> : null}
      {historyQuery.isError ? <div className="error-state">历史OEM评分列表加载失败，当前显示已有的概要数据。</div> : null}
      {isSelectedDetailLoading ? <div className="loading-state">正在加载历史OEM评分详情...</div> : null}
      {selectedDetailLoadState === "error" ? <div className="error-state">历史OEM评分详情加载失败，当前显示可用的概要信息。</div> : null}
      {displayState.showExistingScore && score ? (
        <div className="page-stack">
          <div className="score-summary">
            <div className={`score-badge grade-${effectiveGrade.toLowerCase()}`}>
              <strong>{effectiveScore}</strong>
              <span>{effectiveGrade}级 · {gradeText(effectiveGrade)}</span>
            </div>
            <div>
              <h3>{getText(strategy, "summary") || "系统已生成OEM适配评分，请结合维度理由和推荐动作判断开发优先级。"}</h3>
              <p>生成时间：{formatAnalysisTime(score.createdAt)}</p>
              {getText(strategy, "priority") ? <span className="status-pill">优先级：{getText(strategy, "priority")}</span> : null}
              {score.manualScore != null ? <span className="status-pill" style={{ background: "#fef3c7", color: "#92400e", marginTop: 6 }}>人工覆盖：{score.manualScore}分 · {score.manualGrade}级{score.manualNotes ? `（${score.manualNotes}）` : ""}</span> : null}
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
      <OemScoreEditDialog
        open={editOpen}
        score={score}
        busy={updateMutation.isPending}
        onClose={() => setEditOpen(false)}
        onSave={(payload) => updateMutation.mutate(payload)}
      />
      <Dialog v2 className="crm-action-dialog" title="确认删除" visible={deleteOpen} onClose={() => setDeleteOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setDeleteOpen(false)} type="button">取消</button>
            <button className="primary-button" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()} type="button">{deleteMutation.isPending ? "删除中..." : "确认删除"}</button>
          </div>
        }>
        <p>删除后数据不可恢复。确定要删除本次OEM评分吗？</p>
      </Dialog>
    </section>
  );
}

function canShowOemScore(score: { id?: string }) {
  // OEM scores are persisted only after calculation finishes, so any returned score is displayable.
  return Boolean(score.id);
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

function OemScoreEditDialog({ open, score, busy, onClose, onSave }: { open: boolean; score?: OemScore | null; busy: boolean; onClose: () => void; onSave: (payload: { manualScore?: number; manualGrade?: string; manualNotes?: string }) => void }) {
  const aiScore = score?.aiScore ?? score?.score ?? 0;
  const aiGrade = score?.aiGrade ?? score?.grade ?? "";
  const [manualScore, setManualScore] = useState(String(score?.manualScore ?? ""));
  const [manualGrade, setManualGrade] = useState(score?.manualGrade ?? "");
  const [manualNotes, setManualNotes] = useState(score?.manualNotes ?? "");

  useEffect(() => {
    setManualScore(score?.manualScore != null ? String(score.manualScore) : "");
    setManualGrade(score?.manualGrade ?? "");
    setManualNotes(score?.manualNotes ?? "");
  }, [score?.id]);

  return (
    <Dialog v2 className="crm-action-dialog" title="手动覆盖OEM评分" visible={open} onClose={onClose}
      footer={
        <div className="toolbar crm-dialog-footer">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={busy} onClick={() => onSave({
            manualScore: manualScore ? Number(manualScore) : undefined,
            manualGrade: manualGrade || undefined,
            manualNotes: manualNotes || undefined
          })} type="button">{busy ? "保存中..." : "保存"}</button>
        </div>
      }>
      <p style={{ marginBottom: 12, color: "#6b7280", fontSize: 13 }}>手动覆盖后将以人工评分为准。留空的字段沿用AI评分。</p>
      <div className="detail-grid">
        <div><label>AI评分</label><span>{aiScore}分 · {aiGrade}级</span></div>
        <div className="form-field">
          <label>人工评分 (0-100)</label>
          <input type="number" min={0} max={100} value={manualScore} onChange={(e) => setManualScore(e.target.value)} style={{ width: "100%" }} placeholder={`${aiScore}`} />
        </div>
        <div className="form-field">
          <label>人工等级</label>
          <input value={manualGrade} onChange={(e) => setManualGrade(e.target.value.toUpperCase())} style={{ width: "100%" }} placeholder={aiGrade} maxLength={2} />
        </div>
      </div>
      <div className="form-field" style={{ marginTop: 12 }}>
        <label>人工备注</label>
        <textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} rows={3} style={{ width: "100%", resize: "vertical" }} placeholder="填写人工复核/调整原因..." />
      </div>
    </Dialog>
  );
}
