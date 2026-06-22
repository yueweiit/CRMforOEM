import { STAGE_LABELS, stageLabel } from "@oem-crm/shared";
import { AppSelect } from "../../components/AppSelect";

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
  const stages = props.options?.stages?.length ? props.options.stages : Object.keys(STAGE_LABELS);
  return (
    <section className="filter-panel reports-filter">
      <label>
        <span>开始日期</span>
        <input type="date" value={props.filters.from} onChange={(event) => props.onChange({ ...props.filters, from: event.target.value })} />
      </label>
      <label>
        <span>结束日期</span>
        <input type="date" value={props.filters.to} onChange={(event) => props.onChange({ ...props.filters, to: event.target.value })} />
      </label>
      <label>
        <span>团队</span>
        <AppSelect
          variant="filter"
          value={props.filters.team_id}
          onChange={(team_id) => props.onChange({ ...props.filters, team_id })}
          options={[
            { value: "", label: "全部团队" },
            ...(props.options?.teams?.map((team) => ({ value: team.id, label: team.name })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>业务员</span>
        <AppSelect
          variant="filter"
          value={props.filters.owner_id}
          onChange={(owner_id) => props.onChange({ ...props.filters, owner_id })}
          options={[
            { value: "", label: "全部业务员" },
            ...(props.options?.users?.map((user) => ({ value: user.id, label: user.name })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>国家</span>
        <AppSelect
          variant="filter"
          value={props.filters.country}
          onChange={(country) => props.onChange({ ...props.filters, country })}
          options={[
            { value: "", label: "全部国家" },
            ...(props.options?.countries?.map((country) => ({ value: country, label: country })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>客户类型</span>
        <AppSelect
          variant="filter"
          value={props.filters.customer_type_id}
          onChange={(customer_type_id) => props.onChange({ ...props.filters, customer_type_id })}
          options={[
            { value: "", label: "全部类型" },
            ...(props.options?.customer_types?.map((type) => ({ value: type.id, label: type.name })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>客户阶段</span>
        <AppSelect
          variant="filter"
          value={props.filters.stage}
          onChange={(stage) => props.onChange({ ...props.filters, stage })}
          options={[
            { value: "", label: "全部阶段" },
            ...stages.map((stage) => ({ value: stage, label: stageLabel(stage) }))
          ]}
        />
      </label>
      <label>
        <span>聚合粒度</span>
        <AppSelect
          variant="filter"
          value={props.filters.group_by}
          onChange={(group_by) => props.onChange({ ...props.filters, group_by })}
          options={[
            { value: "day", label: "按天" },
            { value: "week", label: "按周" },
            { value: "month", label: "按月" }
          ]}
        />
      </label>
    </section>
  );
}
