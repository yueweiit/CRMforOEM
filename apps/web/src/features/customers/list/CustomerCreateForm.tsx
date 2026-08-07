import { Link } from "react-router-dom";
import { AppSelect } from "../../../components/AppSelect";
import { Field } from "../../../components/ui/Field";
import { customerSourceLabel } from "../../../i18n/customer-sources";
import { customerTypeLabel } from "../../../i18n/customer-types";
import { useI18n } from "../../../i18n";
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
  const { t } = useI18n();
  const hasSources = Boolean(options?.sources.length);
  const hasTypes = Boolean(options?.types.length);
  const hasOwners = Boolean(options?.users.length);

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{t("customers.basicInfo")}</h2>
        <span>{t("customers.basicInfoHint")}</span>
      </div>
      {isError ? <div className="error-state panel">{t("customers.createFailed")}：{String(error)}</div> : null}
      {!hasSources || !hasTypes ? (
        <div className="panel loading-state">
          {t("customers.missingDictionary")}
          {canManageDictionaries ? (
            <> {t("customers.configureDictionaryPrefix")} <Link className="table-link" to="/settings/customer-dictionaries">{t("customers.configureDictionaryLink")}</Link> {t("customers.configureDictionarySuffix")}</>
          ) : null}
          {t("customers.createWithoutDictionary")}
        </div>
      ) : null}
      <div className="form-grid">
        <Field label={t("customers.companyName")} value={form.name} onChange={(name) => onFieldChange("name", name)} />
        <Field label={t("customers.websiteUrl")} value={form.websiteUrl} onChange={(websiteUrl) => onFieldChange("websiteUrl", websiteUrl)} placeholder="https://example.com" />
        <Field label={t("customers.countryRegion")} value={form.country} onChange={(country) => onFieldChange("country", country)} />
        <Field label={t("customers.customerLanguage")} value={form.language} onChange={(language) => onFieldChange("language", language)} placeholder="en" />
        <Field label={t("customers.timezone")} value={form.timezone} onChange={(timezone) => onFieldChange("timezone", timezone)} placeholder="America/New_York" />
        <Field label={t("customers.currency")} value={form.currency} onChange={(currency) => onFieldChange("currency", currency)} placeholder="USD" />
        <label>
          <span>{t("customers.customerSource")}</span>
          <AppSelect
            value={form.sourceId}
            onChange={(sourceId) => onFieldChange("sourceId", sourceId)}
            options={[
              { value: "", label: hasSources ? t("common.notSelected") : t("customers.noSource") },
              ...(options?.sources.map((item) => ({ value: item.id, label: customerSourceLabel(item.name, t) })) ?? [])
            ]}
          />
        </label>
        <label>
          <span>{t("customers.customerType")}</span>
          <AppSelect
            value={form.typeId}
            onChange={(typeId) => onFieldChange("typeId", typeId)}
            options={[
              { value: "", label: hasTypes ? t("common.notSelected") : t("customers.noType") },
              ...(options?.types.map((item) => ({ value: item.id, label: customerTypeLabel(item.name, t) })) ?? [])
            ]}
          />
        </label>
        <label>
          <span>{t("common.owner")}</span>
          <AppSelect
            value={form.ownerId}
            onChange={(ownerId) => onFieldChange("ownerId", ownerId)}
            options={[
              { value: "", label: hasOwners ? t("customers.defaultCurrentUser") : t("customers.noOwner") },
              ...(options?.users.map((item) => ({ value: item.id, label: item.name })) ?? [])
            ]}
          />
        </label>
        <Field label={t("customers.tags")} value={form.tags} onChange={(tags) => onFieldChange("tags", tags)} placeholder={t("customers.tagsPlaceholder")} />
        <label className="wide-field">
          <span>{t("common.note")}</span>
          <textarea value={form.notes} onChange={(event) => onFieldChange("notes", event.target.value)} />
        </label>
        <div className="wide-field">
          <button className="primary-button" disabled={!form.name || isPending} onClick={onSubmit}>
            {isPending ? t("customers.creating") : t("customers.createCustomer")}
          </button>
        </div>
      </div>
    </section>
  );
}
