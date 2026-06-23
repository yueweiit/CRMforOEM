import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOemScoringWeights, updateOemScoringWeights } from "../../../api/settings";
import { getCurrentUser, hasPermission } from "../../../auth/permissions";
import { notifyMutationStep } from "../../../components/Toast";
import type { OemScoringWeights } from "../shared/types";

const DEFAULT_WEIGHTS: OemScoringWeights = {
  productLineFit: 20,
  marketFit: 15,
  priceBandFit: 15,
  brandMaturity: 15,
  websiteCompleteness: 10,
  contactQuality: 10,
  cooperationOpportunity: 15,
  riskPenaltyMax: 10
};

const SCORING_FIELDS = [
  { key: "productLineFit" as const, label: "产品线匹配度", description: "客户产品线与我方 OEM/ODM 能力匹配程度" },
  { key: "marketFit" as const, label: "市场匹配度", description: "国家、区域、渠道、目标市场匹配程度" },
  { key: "priceBandFit" as const, label: "价格带匹配度", description: "客户定位与我方价格能力匹配程度" },
  { key: "brandMaturity" as const, label: "品牌成熟度", description: "品牌可信度、公司规模、业务稳定性" },
  { key: "websiteCompleteness" as const, label: "官网完整度", description: "官网分析、背调数据完整度和可信度" },
  { key: "contactQuality" as const, label: "联系人质量", description: "联系人有效性、职位、决策人程度" },
  { key: "cooperationOpportunity" as const, label: "合作机会", description: "OEM/ODM、定制、补货、扩品机会" }
] as const;

const BONUS_KEYS = SCORING_FIELDS.map((f) => f.key);

export function ScoringWeights() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();
  const canEdit = hasPermission(currentUser, "settings.scoring_weights.manage");

  const { data: serverWeights, isLoading } = useQuery({
    queryKey: ["oem-scoring-weights"],
    queryFn: () => getOemScoringWeights<OemScoringWeights>()
  });

  const [form, setForm] = useState<OemScoringWeights>(DEFAULT_WEIGHTS);

  useEffect(() => {
    if (serverWeights) {
      setForm({
        productLineFit: serverWeights.productLineFit,
        marketFit: serverWeights.marketFit,
        priceBandFit: serverWeights.priceBandFit,
        brandMaturity: serverWeights.brandMaturity,
        websiteCompleteness: serverWeights.websiteCompleteness,
        contactQuality: serverWeights.contactQuality,
        cooperationOpportunity: serverWeights.cooperationOpportunity,
        riskPenaltyMax: serverWeights.riskPenaltyMax
      });
    }
  }, [serverWeights]);

  const bonusSum = BONUS_KEYS.reduce((sum, key) => sum + form[key], 0);
  const riskValid = form.riskPenaltyMax >= 0 && form.riskPenaltyMax <= 10;
  const canSave = canEdit && bonusSum === 100 && riskValid && BONUS_KEYS.every((key) => Number.isInteger(form[key]) && form[key] >= 0) && Number.isInteger(form.riskPenaltyMax);

  const save = useMutation({
    mutationFn: () => updateOemScoringWeights<OemScoringWeights>(form),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "保存中", message: "正在保存评分权重配置。", dedupeKey: "oem-scoring-weights-save" }),
    onSuccess: (result) => {
      notifyMutationStep({ phase: "success", title: "保存成功", message: "评分权重已保存，后续新生成的 OEM 评分将使用该配置。" });
      setForm(result);
      queryClient.invalidateQueries({ queryKey: ["oem-scoring-weights"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "保存失败，请稍后重试。";
      notifyMutationStep({ phase: "error", title: "保存失败", message, dedupeKey: "oem-scoring-weights-save:error" });
    }
  });

  function updateField(key: keyof OemScoringWeights, raw: string) {
    const intValue = raw === "" ? 0 : parseInt(raw, 10);
    if (Number.isNaN(intValue)) return;
    setForm({ ...form, [key]: intValue });
  }

  function resetToDefaults() {
    setForm({ ...DEFAULT_WEIGHTS });
  }

  if (isLoading) return <div className="empty-state">正在加载评分权重配置...</div>;

  return (
    <div className="page-stack">
      {!canEdit ? (
        <div className="empty-state" style={{ background: "#fef9c3", color: "#854d0e", padding: 12, borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
          当前账号仅可查看评分权重，只有管理员可以修改全局评分标准。
        </div>
      ) : null}

      <div className="empty-state" style={{ marginBottom: 16, fontSize: 13 }}>
        用于调整客户 OEM 适配评分中各维度的占比。修改后只影响后续新生成的评分，历史评分不会自动重算。
      </div>

      <section className="panel">
        <div className="panel-title"><h2>加分项权重</h2><span>总和必须等于 100</span></div>
        <table>
          <thead>
            <tr>
              <th>评分项</th>
              <th>说明</th>
              <th style={{ width: 100 }}>权重</th>
            </tr>
          </thead>
          <tbody>
            {SCORING_FIELDS.map((field) => (
              <tr key={field.key}>
                <td><strong>{field.label}</strong></td>
                <td><small>{field.description}</small></td>
                <td>
                  <input
                    type="number"
                    className="table-input"
                    style={{ width: 72, textAlign: "center" }}
                    value={form[field.key]}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!canEdit}
                    onChange={(event) => updateField(field.key, event.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="empty-state" style={{ marginTop: 12, fontSize: 13, color: bonusSum === 100 ? "#166534" : "#991b1b", background: bonusSum === 100 ? "#dcfce7" : "#fee2e2", padding: 8, borderRadius: 6 }}>
          {bonusSum === 100 ? "当前总权重：100 / 100 ✓" : bonusSum < 100 ? `当前总权重：${bonusSum} / 100，请调整加分项权重，总和必须等于 100。` : `当前总权重：${bonusSum} / 100，请降低部分加分项权重。`}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><h2>风险扣分</h2><span>范围 0-10</span></div>
        <table>
          <thead>
            <tr>
              <th>配置项</th>
              <th>说明</th>
              <th style={{ width: 100 }}>数值</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>风险最大扣分</strong></td>
              <td><small>黑名单、信息异常、低可信度等风险最多可扣分数</small></td>
              <td>
                <input
                  type="number"
                  className="table-input"
                  style={{ width: 72, textAlign: "center" }}
                  value={form.riskPenaltyMax}
                  min={0}
                  max={10}
                  step={1}
                  disabled={!canEdit}
                  onChange={(event) => updateField("riskPenaltyMax", event.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>
        {!riskValid ? (
          <div className="empty-state" style={{ marginTop: 12, fontSize: 13, color: "#991b1b", background: "#fee2e2", padding: 8, borderRadius: 6 }}>
            风险最大扣分必须在 0-10 之间。
          </div>
        ) : null}
      </section>

      {canEdit ? (
        <div className="toolbar" style={{ gap: 8 }}>
          <button className="primary-button" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "保存中..." : "保存配置"}
          </button>
          <button className="secondary-button" disabled={save.isPending} onClick={resetToDefaults}>
            恢复默认
          </button>
        </div>
      ) : null}
    </div>
  );
}
