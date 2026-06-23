import { Link } from "react-router-dom";
import { AppSelect } from "../../../components/AppSelect";
import { Field } from "../../../components/ui/Field";
import type { CustomerOptions } from "../../../shared/types/customer";

export function CustomerCreateForm({
  form,
  onFieldChange,
  options,
  isError,
  error,
  isPending,
  onSubmit,
  canManageDictionaries
}: {
  form: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  options?: CustomerOptions;
  isError: boolean;
  error: unknown;
  isPending: boolean;
  onSubmit: () => void;
  canManageDictionaries: boolean;
}) {
  const hasSources = Boolean(options?.sources.length);
  const hasTypes = Boolean(options?.types.length);
  const hasOwners = Boolean(options?.users.length);

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>客户基础信息</h2>
        <span>录入公司名和官网后即可进入智能背调流程</span>
      </div>
      {isError ? <div className="error-state panel">创建失败：{String(error)}</div> : null}
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
        <Field label="公司名称 *" value={form.name} onChange={(name) => onFieldChange("name", name)} />
        <Field label="官网URL" value={form.websiteUrl} onChange={(websiteUrl) => onFieldChange("websiteUrl", websiteUrl)} placeholder="https://example.com" />
        <Field label="国家/地区" value={form.country} onChange={(country) => onFieldChange("country", country)} />
        <Field label="语言" value={form.language} onChange={(language) => onFieldChange("language", language)} placeholder="en" />
        <Field label="时区" value={form.timezone} onChange={(timezone) => onFieldChange("timezone", timezone)} placeholder="America/New_York" />
        <Field label="币种" value={form.currency} onChange={(currency) => onFieldChange("currency", currency)} placeholder="USD" />
        <label>
          <span>客户来源</span>
          <AppSelect
            value={form.sourceId}
            onChange={(sourceId) => onFieldChange("sourceId", sourceId)}
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
            onChange={(typeId) => onFieldChange("typeId", typeId)}
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
            onChange={(ownerId) => onFieldChange("ownerId", ownerId)}
            options={[
              { value: "", label: hasOwners ? "默认当前用户" : "暂无可选负责人" },
              ...(options?.users.map((item) => ({ value: item.id, label: item.name })) ?? [])
            ]}
          />
        </label>
        <Field label="标签" value={form.tags} onChange={(tags) => onFieldChange("tags", tags)} placeholder="用逗号分隔" />
        <label className="wide-field">
          <span>备注</span>
          <textarea value={form.notes} onChange={(event) => onFieldChange("notes", event.target.value)} />
        </label>
        <div className="wide-field">
          <button className="primary-button" disabled={!form.name || isPending} onClick={onSubmit}>
            {isPending ? "创建中..." : "创建客户"}
          </button>
        </div>
      </div>
    </section>
  );
}
