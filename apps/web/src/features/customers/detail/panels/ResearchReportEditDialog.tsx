import { useEffect, useState } from "react";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import type { ResearchReport, ResearchReportJson, ResearchReportSection } from "../shared/types";
import { asRecord, getText } from "../shared/ui";
import "./analysis-edit.css";

export type ResearchReportUpdatePayload = {
  title?: string;
  reportJson?: Partial<ResearchReportJson>;
};

type ResearchFieldSpec = {
  key: string;
  label: string;
  kind: "text" | "list";
};

type ResearchSectionSpec = {
  key: string;
  label: string;
  fields: ResearchFieldSpec[];
  includeCommonFields?: boolean;
};

const commonResearchFields: ResearchFieldSpec[] = [
  { key: "confirmed_facts", label: "已确认事实", kind: "list" },
  { key: "analysis", label: "分析判断", kind: "text" },
  { key: "missing_info", label: "待补充信息", kind: "list" }
];

const researchSectionSpecs: ResearchSectionSpec[] = [
  {
    key: "company_basic_info",
    label: "一、公司基本信息",
    includeCommonFields: true,
    fields: [
      { key: "company_name", label: "公司名称", kind: "text" },
      { key: "country", label: "所属国家", kind: "text" },
      { key: "website", label: "官网", kind: "text" },
      { key: "company_type", label: "企业类型", kind: "text" },
      { key: "main_business", label: "主营业务", kind: "text" },
      { key: "sales_markets", label: "销售市场", kind: "list" },
      { key: "contacts", label: "联系方式", kind: "list" },
      { key: "social_media_accounts", label: "社交媒体账号", kind: "list" }
    ]
  },
  {
    key: "background_history",
    label: "二、企业背景和发展历程",
    includeCommonFields: true,
    fields: [
      { key: "founded_year", label: "成立时间", kind: "text" },
      { key: "development_milestones", label: "发展节点", kind: "list" },
      { key: "brand_evolution", label: "品牌迭代情况", kind: "text" },
      { key: "operating_scale", label: "经营规模", kind: "text" },
      { key: "market_coverage", label: "市场覆盖范围", kind: "list" }
    ]
  },
  {
    key: "core_business_product_lines",
    label: "三、核心业务与产品线",
    includeCommonFields: true,
    fields: [
      { key: "main_products", label: "主营产品", kind: "list" },
      { key: "product_categories", label: "产品分类", kind: "list" },
      { key: "hot_products", label: "爆款产品", kind: "list" },
      { key: "core_selling_points", label: "产品核心卖点", kind: "list" },
      { key: "oem_odm_fit", label: "OEM/ODM合作适配性判断", kind: "text" }
    ]
  },
  {
    key: "market_competition",
    label: "四、市场表现与竞争格局",
    includeCommonFields: true,
    fields: [
      { key: "main_sales_markets", label: "主营销售市场", kind: "list" },
      { key: "benchmark_competitors", label: "对标竞争品牌", kind: "list" },
      { key: "channel_types", label: "销售渠道类型", kind: "list" },
      { key: "market_positioning", label: "市场定位", kind: "text" },
      { key: "supply_chain_needs", label: "供应链采购需求", kind: "list" }
    ]
  },
  {
    key: "brand_marketing",
    label: "五、品牌策略与营销",
    includeCommonFields: true,
    fields: [
      { key: "brand_tier", label: "品牌档次定位", kind: "text" },
      { key: "website_visual_style", label: "官网视觉风格", kind: "text" },
      { key: "marketing_messages", label: "营销话术", kind: "list" },
      { key: "target_audience", label: "目标客群", kind: "list" },
      { key: "social_media_activity", label: "社媒活跃度", kind: "text" },
      { key: "promotion_direction", label: "品牌推广方向", kind: "text" }
    ]
  },
  {
    key: "price_positioning",
    label: "六、产品价格定位",
    includeCommonFields: true,
    fields: [
      { key: "price_range", label: "产品价格区间", kind: "text" },
      { key: "tier_judgement", label: "高端/中端/平价档次判定", kind: "text" },
      { key: "quality_price_match", label: "品质与价格匹配度", kind: "text" },
      { key: "suitable_supply_grade", label: "适配供货产品等级", kind: "text" }
    ]
  },
  {
    key: "website_product_analysis",
    label: "七、官网产品分析",
    includeCommonFields: true,
    fields: [
      { key: "product_categories", label: "产品分类", kind: "list" },
      { key: "product_count", label: "产品数量", kind: "text" },
      { key: "image_style", label: "图片风格", kind: "text" },
      { key: "selling_point_descriptions", label: "卖点描述", kind: "list" },
      { key: "hot_products", label: "热销款", kind: "list" },
      { key: "missing_product_lines", label: "缺失产品线", kind: "list" },
      { key: "cooperation_entry_opportunities", label: "合作切入机会", kind: "list" }
    ]
  },
  {
    key: "summary_development_recommendations",
    label: "八、总结与开发建议",
    fields: [
      { key: "customer_value_rating", label: "客户开发价值评级", kind: "text" },
      { key: "development_priority", label: "开发优先级", kind: "text" },
      { key: "recommended_products", label: "推荐供货产品", kind: "list" },
      { key: "email_entry_points", label: "邮件开发切入点", kind: "list" },
      { key: "cooperation_opportunities", label: "合作机会", kind: "list" },
      { key: "potential_risks", label: "潜在合作风险", kind: "list" },
      { key: "next_actions", label: "下一步行动", kind: "list" }
    ]
  }
];

function splitLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function stringifyResearchField(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).join("\n");
  }
  return typeof value === "string" ? value : "";
}

function createResearchReportForm(report?: ResearchReport | null) {
  const reportJson = asRecord(report?.reportJson);
  const sections = asRecord(reportJson.sections);
  const formSections: Record<string, Record<string, string>> = {};

  for (const spec of researchSectionSpecs) {
    const currentSection = asRecord(sections[spec.key]);
    const fields = spec.includeCommonFields ? [...spec.fields, ...commonResearchFields] : spec.fields;
    formSections[spec.key] = {};
    for (const field of fields) {
      formSections[spec.key][field.key] = stringifyResearchField(currentSection[field.key]);
    }
  }

  return {
    title: report?.title ?? getText(reportJson, "title"),
    sections: formSections
  };
}

type ResearchReportForm = ReturnType<typeof createResearchReportForm>;

export function ResearchReportEditDialog({
  open,
  report,
  busy,
  onClose,
  onSave
}: {
  open: boolean;
  report?: ResearchReport | null;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: ResearchReportUpdatePayload) => void;
}) {
  const [form, setForm] = useState<ResearchReportForm>(() => createResearchReportForm(report));

  useEffect(() => {
    if (open) {
      setForm(createResearchReportForm(report));
    }
  }, [open, report?.id]);

  const setTitle = (value: string) => setForm((current) => ({ ...current, title: value }));
  const setField = (sectionKey: string, fieldKey: string, value: string) => {
    setForm((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [sectionKey]: {
          ...(current.sections[sectionKey] ?? {}),
          [fieldKey]: value
        }
      }
    }));
  };
  const save = () => {
    const sections: Record<string, ResearchReportSection> = {};
    for (const spec of researchSectionSpecs) {
      const fields = spec.includeCommonFields ? [...spec.fields, ...commonResearchFields] : spec.fields;
      const sectionForm = form.sections[spec.key] ?? {};
      const section: ResearchReportSection = {};
      for (const field of fields) {
        const value = sectionForm[field.key] ?? "";
        section[field.key] = field.kind === "list" ? splitLines(value) : value.trim();
      }
      sections[spec.key] = section;
    }
    onSave({
      title: form.title.trim(),
      reportJson: { sections }
    });
  };

  return (
    <Dialog v2 className="crm-action-dialog" title="编辑背调报告" visible={open} onClose={onClose}
      footer={
        <div className="toolbar crm-dialog-footer">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={busy} onClick={save} type="button">{busy ? "保存中..." : "保存"}</button>
        </div>
      }>
      <div className="analysis-edit-form">
        <div className="form-field">
          <label>报告标题</label>
          <input value={form.title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="warning-state">来源依据、source basis、AI运行状态不在这里编辑，保存时会保留原始来源。</div>
        {researchSectionSpecs.map((section) => (
          <ResearchReportSectionEditor
            key={section.key}
            spec={section}
            values={form.sections[section.key] ?? {}}
            onChange={(fieldKey, value) => setField(section.key, fieldKey, value)}
          />
        ))}
      </div>
    </Dialog>
  );
}

function ResearchReportSectionEditor({
  spec,
  values,
  onChange
}: {
  spec: ResearchSectionSpec;
  values: Record<string, string>;
  onChange: (fieldKey: string, value: string) => void;
}) {
  const fields = spec.includeCommonFields ? [...spec.fields, ...commonResearchFields] : spec.fields;
  return (
    <div className="analysis-edit-section">
      <div className="analysis-edit-section__title">
        <strong>{spec.label}</strong>
      </div>
      <div className="analysis-edit-grid">
        {fields.map((field) => (
          <div className={`form-field ${field.key === "analysis" ? "wide-field" : ""}`} key={`${spec.key}-${field.key}`}>
            <label>{field.label}{field.kind === "list" ? "（每行一条）" : ""}</label>
            <textarea
              value={values[field.key] ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
              rows={field.kind === "list" || field.key === "analysis" ? 3 : 2}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
