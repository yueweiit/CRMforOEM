import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { Award, Boxes, BriefcaseBusiness, Factory, FileText, Plus } from "lucide-react";
import { NavLink, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { inferToastType, showClientToast } from "../../components/Toast";
import { splitList } from "../../utils/string";
import { KnowledgeForm, type Field, type SpecPair } from "./KnowledgeForm";
import { KnowledgeTable, type KnowledgeRecord } from "./KnowledgeTable";

type CompanyProfile = {
  id: string;
  legalName: string;
  displayName: string;
  websiteUrl?: string;
  summary?: string;
  markets: string[];
  foundedAt?: string | null;
  factoryAddress?: string | null;
  productionScale?: string | null;
};

const sections = [
  { to: "company", label: "公司信息", icon: BriefcaseBusiness },
  { to: "brands", label: "品牌资料", icon: BriefcaseBusiness },
  { to: "products", label: "产品资料", icon: Boxes },
  { to: "oem-capabilities", label: "OEM能力", icon: Factory },
  { to: "certificates", label: "资质证书", icon: Award },
  { to: "cases", label: "成功案例", icon: FileText },
  { to: "email-materials", label: "邮件素材", icon: FileText }
] as const;

const sectionApi: Record<string, string> = {
  brands: "brands",
  products: "products",
  "oem-capabilities": "oem-capabilities",
  certificates: "certificates",
  cases: "case-studies",
  "email-materials": "email-materials"
};

const uploadEntityTypeMap: Record<string, string> = {
  products: "product",
  certificates: "certificate",
  cases: "case_study"
};

const fieldMap: Record<string, Field[]> = {
  brands: [
    { key: "name", label: "品牌名称", required: true },
    { key: "positioning", label: "品牌定位" },
    { key: "websiteUrl", label: "品牌官网", placeholder: "https://example.com" },
    { key: "targetMarkets", label: "目标市场", placeholder: "用逗号分隔，如 US,EU" },
    { key: "competitiveAdvantage", label: "核心竞争优势", type: "textarea",required: true }
  ],
  products: [
    { key: "name", label: "产品名称", required: true },
    { key: "sku", label: "SKU" },
    { key: "category", label: "品类", required: true },
    { key: "material", label: "材质" },
    { key: "priceMin", label: "最低价", type: "number" },
    { key: "priceMax", label: "最高价", type: "number" },
    { key: "currency", label: "币种", placeholder: "USD" },
    { key: "targetMarkets", label: "适配市场", placeholder: "用逗号分隔" },
    { key: "tags", label: "标签", placeholder: "用逗号分隔" },
    { key: "specifications", label: "规格参数", type: "textarea", placeholder: '{"尺寸":"100x200mm","重量":"500g"}' },
    { key: "description", label: "描述", type: "textarea" },
    { key: "imageAssetIds", label: "产品图片", type: "file", multiple: true }
  ],
  "oem-capabilities": [
    { key: "name", label: "能力名称", required: true },
    { key: "category", label: "品类", required: true },
    { key: "moq", label: "MOQ" },
    { key: "leadTime", label: "交期" },
    { key: "certifications", label: "关联认证", placeholder: "用逗号分隔" },
    { key: "supportedMarkets", label: "适配市场", placeholder: "用逗号分隔" },
    { key: "description", label: "能力说明", type: "textarea" },
    { key: "packagingCustomization", label: "包装定制", type: "textarea" }
  ],
  certificates: [
    { key: "name", label: "证书名称", required: true },
    { key: "certType", label: "证书类型", required: true, placeholder: "ISO / CE / FDA / OTHER" },
    { key: "issuer", label: "签发机构" },
    { key: "validUntil", label: "有效期", type: "date" },
    { key: "fileAssetIds", label: "证书文件", type: "file", multiple: true }
  ],
  cases: [
    { key: "title", label: "案例标题", required: true },
    { key: "clientName", label: "合作客户" },
    { key: "market", label: "市场" },
    { key: "category", label: "品类" },
    { key: "result", label: "结果", required: true },
    { key: "cooperationDate", label: "合作时间", type: "date" },
    { key: "summary", label: "案例摘要", type: "textarea", required: true },
    { key: "fileAssetIds", label: "案例附件", type: "file", multiple: true }
  ],
  "email-materials": [
    { key: "name", label: "素材名称", required: true },
    { key: "materialType", label: "素材类型", required: true, placeholder: "company_intro / signature / template" },
    { key: "tags", label: "标签", placeholder: "用 , 分隔" },
    { key: "content", label: "内容", type: "textarea", required: true },
  ]
};

const companyFields: Field[] = [
  { key: "legalName", label: "公司全称", required: true },
  { key: "displayName", label: "展示名称", required: true },
  { key: "websiteUrl", label: "官网", placeholder: "https://example.com" },
  { key: "markets", label: "出口市场", placeholder: "用逗号分隔，如 US,EU,UK" },
  { key: "foundedAt", label: "成立时间", type: "date" },
  { key: "factoryAddress", label: "工厂地址" },
  { key: "productionScale", label: "生产规模" },
  { key: "summary", label: "公司简介", type: "textarea" }
];

export function KnowledgeBasePage() {
  const { section = "company" } = useParams();
  const queryClient = useQueryClient();
  const currentSection = sectionApi[section] ? section : "company";
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [specDraft, setSpecDraft] = useState<SpecPair>({ key: "", value: "" });
  const [specPairs, setSpecPairs] = useState<SpecPair[]>([]);

  const companyQuery = useQuery({
    queryKey: ["knowledge", "company-profile"],
    queryFn: () => apiGet<CompanyProfile | null>("/knowledge/company-profile"),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });

  const listQuery = useQuery({
    queryKey: ["knowledge", currentSection],
    queryFn: () => apiGet<KnowledgeRecord[]>(`/knowledge/${sectionApi[currentSection]}`),
    enabled: Boolean(localStorage.getItem("accessToken")) && currentSection !== "company" && Boolean(companyQuery.data)
  });

  const companyMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPatch<CompanyProfile>("/knowledge/company-profile", payload, { toast: false }),
    onSuccess: () => {
      showPageMessage("公司资料已保存。");
      setForm({});
      setSpecDraft({ key: "", value: "" });
      setSpecPairs([]);
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
    onError: (error) => showPageMessage(error instanceof Error ? error.message : "保存失败")
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPost<KnowledgeRecord>(`/knowledge/${sectionApi[currentSection]}`, payload, { toast: false }),
    onSuccess: () => {
      showPageMessage("资料已新增。");
      setForm({});
      setSpecDraft({ key: "", value: "" });
      setSpecPairs([]);
      queryClient.invalidateQueries({ queryKey: ["knowledge", currentSection] });
      queryClient.invalidateQueries({ queryKey: ["knowledge", "company-profile"] });
    },
    onError: (error) => showPageMessage(error instanceof Error ? error.message : "新增失败")
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPatch<KnowledgeRecord>(`/knowledge/${sectionApi[currentSection]}/${editingId}`, payload, { toast: false }),
    onSuccess: () => {
      showPageMessage("资料已更新。");
      setForm({});
      setEditingId("");
      setSpecDraft({ key: "", value: "" });
      setSpecPairs([]);
      queryClient.invalidateQueries({ queryKey: ["knowledge", currentSection] });
      queryClient.invalidateQueries({ queryKey: ["knowledge", "company-profile"] });
    },
    onError: (error) => showPageMessage(error instanceof Error ? error.message : "更新失败")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/knowledge/${sectionApi[currentSection]}/${id}`, { toast: false }),
    onSuccess: () => {
      showPageMessage("资料已删除。");
      queryClient.invalidateQueries({ queryKey: ["knowledge", currentSection] });
      queryClient.invalidateQueries({ queryKey: ["knowledge", "company-profile"] });
    },
    onError: (error) => showPageMessage(error instanceof Error ? error.message : "删除失败")
  });

  const fields = useMemo(() => currentSection === "company" ? companyFields : fieldMap[currentSection] ?? [], [currentSection]);
  const rows = listQuery.data ?? [];
  const company = companyQuery.data;

  function showPageMessage(text: string) {
    if (!text) return;
    showClientToast({
      type: inferToastType(text),
      message: text
    });
  }

  function submit() {
    try {
      const payload = normalizePayload(form, fields, currentSection === "products" ? specPairs : undefined);
      if (currentSection === "company") {
        companyMutation.mutate(payload);
      } else if (editingId) {
        updateMutation.mutate(payload);
      } else {
        createMutation.mutate(payload);
      }
    } catch (error) {
      showPageMessage(error instanceof Error ? error.message : "表单数据无效");
    }
  }

  function startEdit(row: KnowledgeRecord) {
    setEditingId(row.id);
    setForm(recordToForm(row, fields));
    if (currentSection === "products") {
      setSpecPairs(extractSpecPairs(row.specifications));
      setSpecDraft({ key: "", value: "" });
    }
  }

  function cancelEdit() {
    setEditingId("");
    setForm({});
    setSpecDraft({ key: "", value: "" });
    setSpecPairs([]);
  }

  function addSpecPair() {
    const key = specDraft.key.trim();
    const value = specDraft.value.trim();
    if (!key || !value) {
      showPageMessage("规格参数的名称和值都不能为空。");
      return;
    }
    setSpecPairs((current) => {
      const index = current.findIndex((item) => item.key === key);
      if (index >= 0) {
        const next = [...current];
        next[index] = { key, value };
        return next;
      }
      return [...current, { key, value }];
    });
    setSpecDraft({ key: "", value: "" });
  }

  function removeSpecPair(key: string) {
    setSpecPairs((current) => current.filter((item) => item.key !== key));
  }

  function removeRow(id: string) {
    setPendingDeleteId(id);
  }

  function closeDeleteDialog() {
    if (deleteMutation.isPending) return;
    setPendingDeleteId("");
  }

  function confirmDeleteRow() {
    if (!pendingDeleteId) return;
    const targetId = pendingDeleteId;
    setPendingDeleteId("");
    deleteMutation.mutate(targetId);
  }

  return (
    <section className="page-stack">
      <Dialog
        v2
        className="crm-delete-dialog"
        title="确认删除资料"
        visible={Boolean(pendingDeleteId)}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" disabled={deleteMutation.isPending} onClick={closeDeleteDialog} type="button">
              取消
            </button>
            <button className="primary-button" disabled={deleteMutation.isPending} onClick={confirmDeleteRow} type="button">
              {deleteMutation.isPending ? "删除中..." : "删除"}
            </button>
          </div>
        )}
        onClose={closeDeleteDialog}
      >
        确认删除这条资料吗？删除后将无法恢复。
      </Dialog>

      <header className="page-header">
        <div>
          <p className="eyebrow">Knowledge Base</p>
          <h1>企业资料库</h1>
        </div>
        {currentSection !== "company" ? (
          editingId ? (
            <button className="secondary-button" onClick={cancelEdit}>退出编辑</button>
          ) : (
            <button className="primary-button" onClick={submit}>
              <Plus size={16} />
              新增资料
            </button>
          )
        ) : null}
      </header>

      <nav className="tab-bar">
        {sections.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={`/knowledge/${item.to}`} className={({ isActive }) => `tab-link ${isActive ? "active" : ""}`}>
              <Icon size={15} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <section className="panel">
        <div className="panel-title">
          <h2>{sectionLabel(currentSection)}</h2>
          <span>供背调、评分和开发邮件引用</span>
        </div>
        {currentSection !== "company" && !company ? (
          <EmptyState message="请先维护公司信息，再新增产品、OEM能力、证书、案例和邮件素材。" />
        ) : (
          <KnowledgeForm
            fields={fields}
            values={currentSection === "company" && company && !Object.keys(form).length ? companyToForm(company) : form}
            submitLabel={currentSection === "company" ? "保存公司资料" : editingId ? "保存修改" : "新增资料"}
            onChange={setForm}
            onSubmit={submit}
            onCancel={editingId ? cancelEdit : undefined}
            busy={companyMutation.isPending || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending}
            uploadEntityType={uploadEntityTypeMap[currentSection]}
            editingId={editingId}
            specDraft={specDraft}
            specPairs={specPairs}
            onSpecDraftChange={setSpecDraft}
            onAddSpec={addSpecPair}
            onRemoveSpec={removeSpecPair}
          />
        )}
      </section>

      {currentSection !== "company" && company ? (
        <section className="table-panel">
          <div className="panel-title">
            <h2>已维护资料</h2>
            <span>{rows.length} 条</span>
          </div>
          {listQuery.isLoading ? (
            <LoadingState message="正在加载资料..." />
          ) : (
            <KnowledgeTable rows={rows} fields={fields} onEdit={startEdit} onDelete={removeRow} />
          )}
        </section>
      ) : null}
    </section>
  );
}

function normalizePayload(values: Record<string, string>, fields: Field[], specPairs?: SpecPair[]) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key] ?? "";
    const value = raw.trim();

    if (field.type === "file") {
      if (!value) continue;
      payload[field.key] = splitList(value);
      continue;
    }

    if (field.key === "specifications") {
      payload[field.key] = specPairs && specPairs.length ? Object.fromEntries(specPairs.map((item) => [item.key, item.value])) : undefined;
      continue;
    }

    if (!value) continue;

    if (["markets", "tags", "targetMarkets", "certifications", "supportedMarkets"].includes(field.key)) {
      payload[field.key] = splitList(value);
      continue;
    }

    if (field.type === "number") {
      payload[field.key] = Number(value);
      continue;
    }

    payload[field.key] = value;
  }
  return payload;
}

function companyToForm(company: CompanyProfile) {
  return {
    legalName: company.legalName,
    displayName: company.displayName,
    websiteUrl: company.websiteUrl ?? "",
    summary: company.summary ?? "",
    markets: company.markets.join(", "),
    foundedAt: toDateInputValue(company.foundedAt),
    factoryAddress: company.factoryAddress ?? "",
    productionScale: company.productionScale ?? ""
  };
}

function recordToForm(row: KnowledgeRecord, fields: Field[]) {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = row[field.key];
    if (Array.isArray(value)) {
      values[field.key] = value.join(", ");
    } else if (field.type === "date") {
      values[field.key] = toDateInputValue(typeof value === "string" ? value : undefined);
    } else if (field.key === "specifications" && value && typeof value === "object") {
      values[field.key] = JSON.stringify(value, null, 2);
    } else {
      values[field.key] = value === null || value === undefined ? "" : String(value);
    }
  }
  return values;
}

function extractSpecPairs(value: unknown): SpecPair[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).map(([key, raw]) => ({
    key,
    value: raw === null || raw === undefined ? "" : String(raw)
  }));
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function sectionLabel(section: string) {
  return sections.find((item) => item.to === section)?.label ?? "企业资料库";
}
