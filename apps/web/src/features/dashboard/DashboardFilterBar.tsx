import { STAGE_LABELS, stageLabel } from "@oem-crm/shared";
import { AppSelect } from "../../components/AppSelect";
import { customerTypeLabel } from "../../i18n/customer-types";
import { useI18n } from "../../i18n";

export type DashboardFilterOptions = {
  countries: string[];
  customer_types: Array<{ id: string; name: string }>;
  stages: string[];
};

export function DashboardFilterBar(props: {
  filters: { from: string; to: string; country: string; customer_type_id: string; stage: string };
  options?: DashboardFilterOptions;
  onChange: (filters: { from: string; to: string; country: string; customer_type_id: string; stage: string }) => void;
}) {
  const { locale, t } = useI18n();
  const stages = props.options?.stages?.length ? props.options.stages : Object.keys(STAGE_LABELS);
  return (
    <section className="filter-panel">
      <label>
        <span>{t("reports.startDate")}</span>
        <input type="date" value={props.filters.from} onChange={(event) => props.onChange({ ...props.filters, from: event.target.value })} />
      </label>
      <label>
        <span>{t("reports.endDate")}</span>
        <input type="date" value={props.filters.to} onChange={(event) => props.onChange({ ...props.filters, to: event.target.value })} />
      </label>
      <label>
        <span>{t("common.country")}</span>
        <AppSelect
          variant="filter"
          value={props.filters.country}
          onChange={(country) => props.onChange({ ...props.filters, country })}
          options={[
            { value: "", label: t("common.allCountries") },
            ...(props.options?.countries?.map((country) => ({ value: country, label: country })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>{t("reports.customerType")}</span>
        <AppSelect
          variant="filter"
          value={props.filters.customer_type_id}
          onChange={(customer_type_id) => props.onChange({ ...props.filters, customer_type_id })}
          options={[
            { value: "", label: t("common.allTypes") },
            ...(props.options?.customer_types?.map((type) => ({ value: type.id, label: customerTypeLabel(type.name, t) })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>{t("common.stage")}</span>
        <AppSelect
          variant="filter"
          value={props.filters.stage}
          onChange={(stage) => props.onChange({ ...props.filters, stage })}
          options={[
            { value: "", label: t("common.allStages") },
            ...stages.map((stage) => ({ value: stage, label: stageLabel(stage, locale) }))
          ]}
        />
      </label>
    </section>
  );
}
