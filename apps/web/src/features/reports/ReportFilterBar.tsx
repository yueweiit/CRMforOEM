import { STAGE_LABELS, stageLabel } from "@oem-crm/shared";
import { AppSelect } from "../../components/AppSelect";
import { customerTypeLabel } from "../../i18n/customer-types";
import { useI18n } from "../../i18n";

export type DashboardFilterOptions = {
  teams: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; teamId?: string | null }>;
  countries: string[];
  customer_types: Array<{ id: string; name: string }>;
  stages: string[];
};

export function ReportFilterBar(props: {
  filters: { from: string; to: string; team_id: string; owner_id: string; country: string; customer_type_id: string; stage: string; group_by: string };
  options?: DashboardFilterOptions;
  onChange: (filters: { from: string; to: string; team_id: string; owner_id: string; country: string; customer_type_id: string; stage: string; group_by: string }) => void;
}) {
  const { locale, t } = useI18n();
  const stages = props.options?.stages?.length ? props.options.stages : Object.keys(STAGE_LABELS);
  return (
    <section className="filter-panel reports-filter">
      <label>
        <span>{t("reports.startDate")}</span>
        <input type="date" value={props.filters.from} onChange={(event) => props.onChange({ ...props.filters, from: event.target.value })} />
      </label>
      <label>
        <span>{t("reports.endDate")}</span>
        <input type="date" value={props.filters.to} onChange={(event) => props.onChange({ ...props.filters, to: event.target.value })} />
      </label>
      <label>
        <span>{t("common.team")}</span>
        <AppSelect
          variant="filter"
          value={props.filters.team_id}
          onChange={(team_id) => props.onChange({ ...props.filters, team_id })}
          options={[
            { value: "", label: t("common.allTeams") },
            ...(props.options?.teams?.map((team) => ({ value: team.id, label: team.name })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>{t("reports.salesRep")}</span>
        <AppSelect
          variant="filter"
          value={props.filters.owner_id}
          onChange={(owner_id) => props.onChange({ ...props.filters, owner_id })}
          options={[
            { value: "", label: t("common.allOwners") },
            ...(props.options?.users?.map((user) => ({ value: user.id, label: user.name })) ?? [])
          ]}
        />
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
        <span>{t("reports.customerStage")}</span>
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
      <label>
        <span>{t("reports.groupBy")}</span>
        <AppSelect
          variant="filter"
          value={props.filters.group_by}
          onChange={(group_by) => props.onChange({ ...props.filters, group_by })}
          options={[
            { value: "day", label: t("reports.byDay") },
            { value: "week", label: t("reports.byWeek") },
            { value: "month", label: t("reports.byMonth") }
          ]}
        />
      </label>
    </section>
  );
}
