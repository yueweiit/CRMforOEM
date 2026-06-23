import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EMAIL_DRAFT_PURPOSE_LABELS, EMAIL_DRAFT_PURPOSES } from "@oem-crm/shared";
import { getEmailPromptConfigs, previewEmailPromptConfig, resetEmailPromptConfig, updateEmailPromptConfig } from "../../../api/settings";
import { getCurrentUser, hasPermission } from "../../../auth/permissions";
import { Switch } from "../../../components/Switch";
import { notifyMutationStep } from "../../../components/Toast";
import type { EmailPromptConfigData, EmailPromptPreviewResult } from "../shared/types";

export function EmailPrompts() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();
  const canEdit = hasPermission(currentUser, "settings.email_prompt.manage");

  const [selectedPurpose, setSelectedPurpose] = useState<string>(EMAIL_DRAFT_PURPOSES[0]);
  const [form, setForm] = useState<EmailPromptConfigData>({ goal: "", tone: "", mustInclude: [], mustAvoid: [], structure: "", customInstruction: "", isActive: true });
  const [tagInput, setTagInput] = useState<{ mustInclude: string; mustAvoid: string }>({ mustInclude: "", mustAvoid: "" });
  const [preview, setPreview] = useState<EmailPromptPreviewResult | null>(null);
  const purposes = EMAIL_DRAFT_PURPOSES as readonly string[];

  const { data: configs, isLoading } = useQuery({
    queryKey: ["email-prompt-configs"],
    queryFn: () => getEmailPromptConfigs<Record<string, EmailPromptConfigData>>()
  });

  useEffect(() => {
    if (configs && configs[selectedPurpose]) {
      const c = configs[selectedPurpose];
      setForm({ goal: c.goal, tone: c.tone, mustInclude: [...c.mustInclude], mustAvoid: [...c.mustAvoid], structure: c.structure, customInstruction: c.customInstruction, isActive: c.isActive });
      setPreview(null);
      setTagInput({ mustInclude: "", mustAvoid: "" });
    }
  }, [configs, selectedPurpose]);

  const save = useMutation({
    mutationFn: () => updateEmailPromptConfig<EmailPromptConfigData>(selectedPurpose, form),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "保存中", message: "正在保存邮件 Prompt 配置。", dedupeKey: "email-prompt-save" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-prompt-configs"] });
      notifyMutationStep({ phase: "success", title: "保存成功", message: "邮件 Prompt 配置已保存，后续生成的该类型邮件将使用新配置。" });
    },
    onError: (error) => {
      notifyMutationStep({ phase: "error", title: "保存失败", message: error instanceof Error ? error.message : "保存失败" });
    }
  });

  const reset = useMutation({
    mutationFn: () => resetEmailPromptConfig<EmailPromptConfigData>(selectedPurpose),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "恢复中", message: "正在恢复默认配置。", dedupeKey: "email-prompt-reset" }),
    onSuccess: (result) => {
      setForm(result);
      queryClient.invalidateQueries({ queryKey: ["email-prompt-configs"] });
      notifyMutationStep({ phase: "success", title: "已恢复", message: "已恢复为默认 Prompt 配置。" });
    },
    onError: (error) => {
      notifyMutationStep({ phase: "error", title: "恢复失败", message: error instanceof Error ? error.message : "恢复失败" });
    }
  });

  const previewMutation = useMutation({
    mutationFn: () => previewEmailPromptConfig<EmailPromptPreviewResult>(selectedPurpose, form),
    onSuccess: (result) => setPreview(result),
    onError: (error) => {
      notifyMutationStep({ phase: "error", title: "预览失败", message: error instanceof Error ? error.message : "预览失败" });
    }
  });

  function updateField<K extends keyof EmailPromptConfigData>(key: K, value: EmailPromptConfigData[K]) {
    setForm({ ...form, [key]: value });
  }

  function addTag(field: "mustInclude" | "mustAvoid") {
    const value = tagInput[field].trim();
    if (!value) return;
    if (form[field].includes(value)) return;
    updateField(field, [...form[field], value]);
    setTagInput({ ...tagInput, [field]: "" });
  }

  function removeTag(field: "mustInclude" | "mustAvoid", index: number) {
    updateField(field, form[field].filter((_, i) => i !== index));
  }

  function handleTagKeyDown(field: "mustInclude" | "mustAvoid", event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag(field);
    }
  }

  if (isLoading) return <div className="empty-state">正在加载邮件 Prompt 配置...</div>;

  return (
    <div className="content-grid" style={{ gridTemplateColumns: "220px 1fr", gap: 16 }}>
      {/* Left: purpose list */}
      <nav style={{ borderRight: "1px solid var(--color-border, #e5e7eb)", paddingRight: 12 }}>
        <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 8, textTransform: "uppercase" }}>邮件类型</div>
        {purposes.map((purpose) => {
          const label = (EMAIL_DRAFT_PURPOSE_LABELS as Record<string, string>)[purpose] ?? purpose;
          const cfg = configs?.[purpose];
          const isModified = cfg && (cfg.goal !== "" || cfg.tone !== "" || cfg.mustInclude.length > 0 || cfg.mustAvoid.length > 0 || cfg.structure !== "" || cfg.customInstruction !== "");
          return (
            <button
              key={purpose}
              className={`secondary-button${selectedPurpose === purpose ? " active" : ""}`}
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4, fontSize: 13 }}
              onClick={() => { setSelectedPurpose(purpose); setPreview(null); }}
            >
              {label}
              {isModified ? <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>●</span> : null}
            </button>
          );
        })}
      </nav>

      {/* Right: config form */}
      <div className="page-stack">
        {!canEdit ? (
          <div className="empty-state" style={{ background: "#fef9c3", color: "#854d0e", padding: 12, borderRadius: 6, fontSize: 13 }}>
            当前账号仅可查看邮件 Prompt 配置，只有管理员可以修改。
          </div>
        ) : null}

        <section className="panel">
          <div className="panel-title">
            <h2>{(EMAIL_DRAFT_PURPOSE_LABELS as Record<string, string>)[selectedPurpose] ?? selectedPurpose}</h2>
            <span>邮件 Prompt 配置</span>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            {/* Goal */}
            <label>
              <span>邮件目标</span>
              <textarea
                rows={2}
                value={form.goal}
                disabled={!canEdit}
                onChange={(e) => updateField("goal", e.target.value)}
                placeholder="说明这封邮件要达成什么目的"
              />
            </label>

            {/* Tone */}
            <label>
              <span>语气风格</span>
              <textarea
                rows={2}
                value={form.tone}
                disabled={!canEdit}
                onChange={(e) => updateField("tone", e.target.value)}
                placeholder="例如：专业、简洁、温和、不强推"
              />
            </label>

            {/* Must Include */}
            <label>
              <span>必须包含</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                {form.mustInclude.map((item, i) => (
                  <span key={i} style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: 12, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {item}
                    {canEdit ? <button style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} onClick={() => removeTag("mustInclude", i)}>×</button> : null}
                  </span>
                ))}
              </div>
              {canEdit ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    value={tagInput.mustInclude}
                    onChange={(e) => setTagInput({ ...tagInput, mustInclude: e.target.value })}
                    onKeyDown={(e) => handleTagKeyDown("mustInclude", e)}
                    placeholder="输入后按回车添加"
                    style={{ flex: 1 }}
                  />
                  <button className="secondary-button" onClick={() => addTag("mustInclude")}>添加</button>
                </div>
              ) : null}
            </label>

            {/* Must Avoid */}
            <label>
              <span>禁止出现</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                {form.mustAvoid.map((item, i) => (
                  <span key={i} style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 12, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {item}
                    {canEdit ? <button style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} onClick={() => removeTag("mustAvoid", i)}>×</button> : null}
                  </span>
                ))}
              </div>
              {canEdit ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    value={tagInput.mustAvoid}
                    onChange={(e) => setTagInput({ ...tagInput, mustAvoid: e.target.value })}
                    onKeyDown={(e) => handleTagKeyDown("mustAvoid", e)}
                    placeholder="输入后按回车添加"
                    style={{ flex: 1 }}
                  />
                  <button className="secondary-button" onClick={() => addTag("mustAvoid")}>添加</button>
                </div>
              ) : null}
            </label>

            {/* Structure */}
            <label>
              <span>邮件结构</span>
              <textarea
                rows={2}
                value={form.structure}
                disabled={!canEdit}
                onChange={(e) => updateField("structure", e.target.value)}
                placeholder="例如：开场 → 匹配理由 → 合作建议 → 轻量CTA"
              />
            </label>

            {/* Custom Instruction */}
            <label>
              <span>自定义补充指令</span>
              <textarea
                rows={2}
                value={form.customInstruction}
                disabled={!canEdit}
                onChange={(e) => updateField("customInstruction", e.target.value)}
                placeholder="业务团队临时补充的生成规则"
              />
            </label>

            {/* Active toggle */}
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>启用自定义配置</span>
              <Switch checked={form.isActive} onChange={() => updateField("isActive", !form.isActive)} loading={false} />
            </label>
          </div>
        </section>

        {/* Actions */}
        {canEdit ? (
          <div className="toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="primary-button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "保存中..." : "保存配置"}
            </button>
            <button className="secondary-button" disabled={previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? "生成中..." : "预览最终 Prompt"}
            </button>
            <button className="secondary-button" disabled={reset.isPending} onClick={() => {
              if (window.confirm("确认恢复为默认配置？此操作不可撤销。")) reset.mutate();
            }}>
              {reset.isPending ? "恢复中..." : "恢复默认"}
            </button>
          </div>
        ) : null}

        {/* Preview */}
        {preview !== null ? (
          <section className="panel">
            <div className="panel-title"><h2>最终 Prompt 预览</h2></div>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "var(--color-surface, #f9fafb)", padding: 12, borderRadius: 6, maxHeight: 400, overflow: "auto", lineHeight: 1.5 }}>{preview.prompt}</pre>
          </section>
        ) : null}

        <div className="empty-state" style={{ fontSize: 12, color: "var(--color-muted)" }}>
          修改只会影响该邮件类型后续的 AI 生成结果，不会改变已生成的草稿邮件。
        </div>
      </div>
    </div>
  );
}
