import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { AddIconButton } from "../../../../components/AddIconButton";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import type { WebsiteAnalysis, WebsiteAiInsights } from "../shared/types";
import { asArray, getStringArray, getWebsiteAiInsights } from "../shared/ui";
import "./analysis-edit.css";

export type WebsiteAnalysisUpdatePayload = {
  opportunities?: string[];
  risks?: string[];
  aiInsights?: Partial<WebsiteAiInsights>;
};

type WebsitePriceCompetitiveness = NonNullable<WebsiteAiInsights["price_competitiveness"]>;
const editableTextFields: Array<[keyof WebsiteAiInsights, string, number]> = [
  ["business_summary", "客户分析结论", 4],
  ["customer_profile", "客户画像", 3],
  ["main_business", "主营业务", 3],
  ["product_line_analysis", "产品线分析", 3],
  ["brand_positioning", "品牌定位", 3],
  ["market_channel_signals", "市场与渠道信号", 3],
  ["oem_opportunity_assessment", "OEM/ODM机会判断", 3],
  ["our_data_quality_note", "数据质量提示", 2]
];

const editableListFields: Array<[keyof WebsiteAiInsights, string]> = [
  ["cooperation_opportunities", "合作机会"],
  ["sales_entry_points", "邮件开发切入点"],
  ["suggested_next_actions", "下一步建议"],
  ["risk_notes", "风险提示"],
  ["unknown_factors", "待补充信息"]
];

function splitLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function createWebsiteInsightsForm(analysis?: WebsiteAnalysis | null) {
  const insights = getWebsiteAiInsights(analysis ?? undefined) ?? {};
  return {
    business_summary: insights.business_summary ?? "",
    customer_profile: insights.customer_profile ?? "",
    main_business: insights.main_business ?? "",
    product_line_analysis: insights.product_line_analysis ?? "",
    brand_positioning: insights.brand_positioning ?? "",
    market_channel_signals: insights.market_channel_signals ?? "",
    oem_opportunity_assessment: insights.oem_opportunity_assessment ?? "",
    cooperation_opportunities: (insights.cooperation_opportunities ?? getStringArray(analysis?.opportunities)).join("\n"),
    sales_entry_points: (insights.sales_entry_points ?? []).join("\n"),
    suggested_next_actions: (insights.suggested_next_actions ?? []).join("\n"),
    risk_notes: (insights.risk_notes ?? getStringArray(analysis?.risks)).join("\n"),
    unknown_factors: (insights.unknown_factors ?? []).join("\n"),
    our_data_quality_note: insights.our_data_quality_note ?? "",
    missing_categories_gap: insights.missing_categories_gap?.length ? insights.missing_categories_gap : [],
    price_competitiveness: insights.price_competitiveness ?? {
      level: "unknown" as const,
      summary: "",
      price_nature_note: ""
    }
  };
}

type WebsiteInsightsForm = ReturnType<typeof createWebsiteInsightsForm>;

export function WebsiteAnalysisEditDialog({ open, analysis, busy, onClose, onSave }: { open: boolean; analysis?: WebsiteAnalysis | null; busy: boolean; onClose: () => void; onSave: (payload: WebsiteAnalysisUpdatePayload) => void }) {
  const opportunities = asArray(analysis?.opportunities).filter((item) => typeof item === "string") as string[];
  const risks = asArray(analysis?.risks).filter((item) => typeof item === "string") as string[];
  const [oppText, setOppText] = useState(opportunities.join("\n"));
  const [riskText, setRiskText] = useState(risks.join("\n"));
  const [form, setForm] = useState(() => createWebsiteInsightsForm(analysis));

  useEffect(() => {
    setOppText(opportunities.join("\n"));
    setRiskText(risks.join("\n"));
    if (open) {
      setForm(createWebsiteInsightsForm(analysis));
    }
  }, [analysis?.id, open]);

  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const updateGap = (index: number, key: string, value: string | number) => {
    setForm((current) => ({
      ...current,
      missing_categories_gap: current.missing_categories_gap.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)
    }));
  };
  const removeGap = (index: number) => {
    setForm((current) => ({
      ...current,
      missing_categories_gap: current.missing_categories_gap.filter((_, itemIndex) => itemIndex !== index)
    }));
  };
  const addGap = () => {
    setForm((current) => ({
      ...current,
      missing_categories_gap: [
        ...current.missing_categories_gap,
        {
          category: "",
          customer_has: "",
          we_can_supply: "",
          opportunity_score: 5,
          reason: "",
          data_quality_note: ""
        }
      ]
    }));
  };
  const save = () => {
    const aiInsights: Partial<WebsiteAiInsights> = {
      business_summary: form.business_summary.trim(),
      customer_profile: form.customer_profile.trim(),
      main_business: form.main_business.trim(),
      product_line_analysis: form.product_line_analysis.trim(),
      brand_positioning: form.brand_positioning.trim(),
      market_channel_signals: form.market_channel_signals.trim(),
      oem_opportunity_assessment: form.oem_opportunity_assessment.trim(),
      cooperation_opportunities: splitLines(oppText),
      sales_entry_points: splitLines(form.sales_entry_points),
      suggested_next_actions: splitLines(form.suggested_next_actions),
      risk_notes: splitLines(riskText),
      unknown_factors: splitLines(form.unknown_factors),
      our_data_quality_note: form.our_data_quality_note.trim(),
      missing_categories_gap: form.missing_categories_gap.map((item) => ({
        category: item.category.trim(),
        customer_has: item.customer_has.trim(),
        we_can_supply: item.we_can_supply.trim(),
        opportunity_score: Number.isFinite(Number(item.opportunity_score)) ? Number(item.opportunity_score) : 5,
        reason: item.reason.trim(),
        data_quality_note: item.data_quality_note.trim()
      })),
      price_competitiveness: {
        level: form.price_competitiveness.level,
        summary: form.price_competitiveness.summary.trim(),
        price_nature_note: form.price_competitiveness.price_nature_note.trim()
      }
    };
    onSave({ aiInsights });
  };

  return (
    <Dialog v2 className="crm-action-dialog" title="编辑官网分析" visible={open} onClose={onClose}
      footer={
        <div className="toolbar crm-dialog-footer">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={busy} onClick={save} type="button">{busy ? "保存中..." : "保存"}</button>
        </div>
      }>
      <div className="analysis-edit-form">
        <div className="form-field">
          <label>合作机会（每行一条）</label>
          <textarea value={oppText} onChange={(e) => setOppText(e.target.value)} rows={5} />
        </div>
        <div className="form-field">
          <label>风险提示（每行一条）</label>
          <textarea value={riskText} onChange={(e) => setRiskText(e.target.value)} rows={5} />
        </div>
        <WebsiteAnalysisStructuredFields
          form={form}
          setForm={setForm}
          setField={setField}
          updateGap={updateGap}
          removeGap={removeGap}
          addGap={addGap}
        />
      </div>
    </Dialog>
  );
}

function WebsiteAnalysisStructuredFields({
  form,
  setForm,
  setField,
  updateGap,
  removeGap,
  addGap
}: {
  form: WebsiteInsightsForm;
  setForm: Dispatch<SetStateAction<WebsiteInsightsForm>>;
  setField: (key: string, value: string) => void;
  updateGap: (index: number, key: string, value: string | number) => void;
  removeGap: (index: number) => void;
  addGap: () => void;
}) {
  return (
    <>
      <div className="warning-state">来源证据、sourceId 和页面 URL 不在这里编辑，保存时会自动保留原始来源。</div>
      <div className="analysis-edit-grid">
        {editableTextFields.map(([key, label, rows]) => (
          <div className="form-field" key={key}>
            <label>{label}</label>
            <textarea value={String(form[key as keyof WebsiteInsightsForm] ?? "")} onChange={(event) => setField(key, event.target.value)} rows={rows} />
          </div>
        ))}
        {editableListFields.filter(([key]) => key !== "cooperation_opportunities" && key !== "risk_notes").map(([key, label]) => (
          <div className="form-field" key={key}>
            <label>{label}（每行一条）</label>
            <textarea value={String(form[key as keyof WebsiteInsightsForm] ?? "")} onChange={(event) => setField(key, event.target.value)} rows={4} />
          </div>
        ))}
      </div>
      <div className="analysis-edit-section">
        <div className="analysis-edit-section__title">
          <strong>价格竞争力</strong>
        </div>
        <div className="analysis-edit-price">
          <div className="form-field">
            <label>竞争力等级</label>
            <select
              value={form.price_competitiveness.level}
              onChange={(event) => setForm((current) => ({
                ...current,
                price_competitiveness: { ...current.price_competitiveness, level: event.target.value as WebsitePriceCompetitiveness["level"] }
              }))}
            >
              <option value="competitive">有竞争力</option>
              <option value="neutral">持平</option>
              <option value="challenging">偏弱</option>
              <option value="unknown">未知</option>
            </select>
          </div>
          <div className="form-field">
            <label>价格判断</label>
            <textarea
              value={form.price_competitiveness.summary}
              onChange={(event) => setForm((current) => ({
                ...current,
                price_competitiveness: { ...current.price_competitiveness, summary: event.target.value }
              }))}
              rows={3}
            />
          </div>
          <div className="form-field">
            <label>价格数据说明</label>
            <textarea
              value={form.price_competitiveness.price_nature_note}
              onChange={(event) => setForm((current) => ({
                ...current,
                price_competitiveness: { ...current.price_competitiveness, price_nature_note: event.target.value }
              }))}
              rows={3}
            />
          </div>
        </div>
      </div>
      <div className="analysis-edit-section">
        <div className="analysis-edit-section__title">
          <strong>缺失品类对比</strong>
          <AddIconButton label="新增品类" onClick={addGap} />
        </div>
        {form.missing_categories_gap.length ? (
          <div className="analysis-edit-gap-list">
            {form.missing_categories_gap.map((item, index) => (
              <div className="analysis-edit-gap" key={`missing-category-${index}`}>
                <div className="form-field">
                  <label>品类</label>
                  <input value={item.category} onChange={(event) => updateGap(index, "category", event.target.value)} />
                </div>
                <div className="form-field">
                  <label>客户现有</label>
                  <input value={item.customer_has} onChange={(event) => updateGap(index, "customer_has", event.target.value)} />
                </div>
                <div className="form-field">
                  <label>我方可供</label>
                  <input value={item.we_can_supply} onChange={(event) => updateGap(index, "we_can_supply", event.target.value)} />
                </div>
                <div className="form-field">
                  <label>机会评分</label>
                  <input type="number" min={0} max={10} value={item.opportunity_score} onChange={(event) => updateGap(index, "opportunity_score", Number(event.target.value))} />
                </div>
                <div className="form-field wide-field">
                  <label>判断原因</label>
                  <textarea value={item.reason} onChange={(event) => updateGap(index, "reason", event.target.value)} rows={2} />
                </div>
                <div className="form-field wide-field">
                  <label>数据质量说明</label>
                  <textarea value={item.data_quality_note} onChange={(event) => updateGap(index, "data_quality_note", event.target.value)} rows={2} />
                </div>
                <div className="analysis-edit-gap__actions">
                  <DeleteIconButton label="移除品类" onClick={() => removeGap(index)} />
                </div>
              </div>
            ))}
          </div>
        ) : <div className="empty-state">暂无缺失品类对比，可按需新增。</div>}
      </div>
    </>
  );
}
