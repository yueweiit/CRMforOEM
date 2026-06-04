import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Plus, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api/http";
import { getCurrentUser, isAdmin } from "../auth/permissions";
import { AppSelect } from "../components/AppSelect";
import { notifyMutationStep } from "../components/Toast";

type Customer = {
  id: string;
  name: string;
  websiteUrl?: string;
  websiteDomain?: string;
  country?: string;
  stage: string;
  owner?: { name: string };
  contacts?: Array<{ email?: string; name?: string }>;
  oemFitScores?: Array<{ score: number; grade: string }>;
  updatedAt: string;
};

type CustomerOptions = {
  sources: Array<{ id: string; name: string }>;
  types: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; email: string }>;
  stages: string[];
};

export function CustomersPage({ mode }: { mode?: "create" }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const canManageDictionaries = isAdmin(currentUser);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [form, setForm] = useState(defaultCustomerForm());
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stage) params.set("stage", stage);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [q, stage]);

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["customers", queryString],
    queryFn: () => apiGet<Customer[]>(`/customers${queryString}`),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });
  const { data: options } = useQuery({
    queryKey: ["customer-filter-options"],
    queryFn: () => apiGet<CustomerOptions>("/customers/filter-options"),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<Customer>("/customers", payload),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "处理中", message: "正在创建客户。", dedupeKey: `customer-create:${form.name}` }),
    onSuccess: (customer) => {
      notifyMutationStep({ phase: "success", title: "操作成功", message: "客户已创建。" });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      navigate(`/customers/${customer.id}/overview`);
    },
    onError: (error) => notifyMutationStep({ phase: "error", title: "操作失败", message: error instanceof Error ? error.message : "创建客户失败。", dedupeKey: `customer-create:${form.name}:error` })
  });
  const hasSources = Boolean(options?.sources.length);
  const hasTypes = Boolean(options?.types.length);
  const hasOwners = Boolean(options?.users.length);

  function submitCustomer() {
    createMutation.mutate({
      ...form,
      tags: splitList(form.tags),
      ownerId: form.ownerId || undefined,
      sourceId: form.sourceId || undefined,
      typeId: form.typeId || undefined
    });
  }

  if (mode === "create") {
    return (
      <section className="page-stack">
        <header className="page-header">
          <div>
            <p className="eyebrow">Customer Development</p>
            <h1>新增目标客户</h1>
          </div>
        </header>
        <section className="panel">
          <div className="panel-title">
            <h2>客户基础信息</h2>
            <span>录入公司名和官网后即可进入智能背调流程</span>
          </div>
          {createMutation.isError ? <div className="error-state panel">创建失败：{String(createMutation.error)}</div> : null}
          {!hasSources || !hasTypes ? (
            <div className="panel loading-state">
              客户来源或客户类型还没有可选项。
              {canManageDictionaries ? (
                <> 请到 <Link className="table-link" to="/settings/customer-dictionaries">系统设置 / 客户字典</Link> 配置；</>
              ) : null}
              也可以先不选直接创建客户。
            </div>
          ) : null}
          <div className="form-grid">
            <Field label="公司名称 *" value={form.name} onChange={(name) => setForm({ ...form, name })} />
            <Field label="官网URL" value={form.websiteUrl} onChange={(websiteUrl) => setForm({ ...form, websiteUrl })} placeholder="https://example.com" />
            <Field label="国家/地区" value={form.country} onChange={(country) => setForm({ ...form, country })} />
            <Field label="语言" value={form.language} onChange={(language) => setForm({ ...form, language })} placeholder="en" />
            <Field label="时区" value={form.timezone} onChange={(timezone) => setForm({ ...form, timezone })} placeholder="America/New_York" />
            <Field label="币种" value={form.currency} onChange={(currency) => setForm({ ...form, currency })} placeholder="USD" />
            <label>
              <span>客户来源</span>
              <AppSelect
                value={form.sourceId}
                onChange={(sourceId) => setForm({ ...form, sourceId })}
                options={[
                  { value: "", label: hasSources ? "未选择" : "暂无来源，请先配置" },
                  ...(options?.sources.map((item) => ({ value: item.id, label: item.name })) ?? [])
                ]}
              />
            </label>
            <label>
              <span>客户类型</span>
              <AppSelect
                value={form.typeId}
                onChange={(typeId) => setForm({ ...form, typeId })}
                options={[
                  { value: "", label: hasTypes ? "未选择" : "暂无类型，请先配置" },
                  ...(options?.types.map((item) => ({ value: item.id, label: item.name })) ?? [])
                ]}
              />
            </label>
            <label>
              <span>负责人</span>
              <AppSelect
                value={form.ownerId}
                onChange={(ownerId) => setForm({ ...form, ownerId })}
                options={[
                  { value: "", label: hasOwners ? "默认当前用户" : "暂无可选负责人" },
                  ...(options?.users.map((item) => ({ value: item.id, label: item.name })) ?? [])
                ]}
              />
            </label>
            <Field label="标签" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} placeholder="用逗号分隔" />
            <label className="wide-field">
              <span>备注</span>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
            <div className="wide-field">
              <button className="primary-button" disabled={!form.name || createMutation.isPending} onClick={submitCustomer}>
                {createMutation.isPending ? "创建中..." : "创建客户"}
              </button>
            </div>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Customer Development</p>
          <h1>客户开发池</h1>
        </div>
        <Link to="/customers/new" className="primary-button">
          <Plus size={16} />
          新增客户
        </Link>
      </header>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input placeholder="搜索公司、官网" value={q} onChange={(event) => setQ(event.target.value)} />
        </div>
        <AppSelect
          variant="toolbar"
          value={stage}
          onChange={setStage}
          title="筛选阶段"
          options={[
            { value: "", label: "全部阶段" },
            ...((options?.stages ?? Object.keys(stageLabels)).map((item) => ({ value: item, label: stageLabel(item) })))
          ]}
        />
        <button className="icon-button" title="筛选">
          <Filter size={17} />
        </button>
      </div>

      <section className="table-panel">
        {isLoading ? <div className="empty-state">正在加载客户...</div> : null}
        {isError ? <div className="error-state">客户列表加载失败，请重新登录或稍后刷新。</div> : null}
        {!isLoading && !isError && !data.length ? <div className="empty-state">暂无客户，请先新增目标客户。</div> : null}
        {data.length ? (
          <table>
            <thead>
              <tr>
                <th>客户</th>
                <th>国家</th>
                <th>阶段</th>
                <th>评分</th>
                <th>联系人</th>
                <th>负责人</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link to={`/customers/${customer.id}/overview`} className="table-link">
                      {customer.name}
                    </Link>
                    <small>{customer.websiteDomain ?? customer.websiteUrl ?? "-"}</small>
                  </td>
                  <td>{customer.country ?? "-"}</td>
                  <td><span className="status-pill">{stageLabel(customer.stage)}</span></td>
                  <td>{customer.oemFitScores?.[0] ? `${customer.oemFitScores[0].score} / ${customer.oemFitScores[0].grade}` : "-"}</td>
                  <td>{customer.contacts?.[0]?.email ?? customer.contacts?.[0]?.name ?? "-"}</td>
                  <td>{customer.owner?.name ?? "-"}</td>
                  <td>{new Date(customer.updatedAt).toLocaleDateString()}</td>
                  <td><Link to={`/customers/${customer.id}/overview`} className="secondary-button">编辑</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </section>
  );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      <span>{props.label}</span>
      <input value={props.value} placeholder={props.placeholder} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function defaultCustomerForm() {
  return {
    name: "",
    websiteUrl: "",
    country: "",
    language: "",
    timezone: "",
    currency: "",
    sourceId: "",
    typeId: "",
    ownerId: "",
    tags: "",
    notes: ""
  };
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const stageLabels: Record<string, string> = {
  PENDING_RESEARCH: "待背调",
  RESEARCHING: "背调中",
  RESEARCHED: "已背调",
  PENDING_EMAIL_GENERATION: "待生成邮件",
  PENDING_EMAIL_SEND: "待发送邮件",
  FIRST_EMAIL_SENT: "已发送首封邮件",
  PENDING_SECOND_FOLLOW_UP: "待二次跟进",
  REPLIED: "客户已回复",
  REQUIREMENT_CONFIRMING: "需求确认中",
  QUOTING: "报价中",
  SAMPLING: "样品中",
  NEGOTIATING: "订单谈判",
  WON: "已成交",
  PAUSED: "暂缓开发",
  INVALID: "无效客户",
  BLACKLISTED: "黑名单"
};

function stageLabel(stage: string) {
  return stageLabels[stage] ?? stage;
}
