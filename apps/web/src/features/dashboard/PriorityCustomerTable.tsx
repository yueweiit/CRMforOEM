import { stageLabel } from "@oem-crm/shared";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n";
import { formatDateTime } from "../../shared/utils/format";
import type { PriorityCustomerRow } from "../../shared/types/customer";

export function PriorityCustomerTable({ rows }: { rows: PriorityCustomerRow[] }) {
  const { locale, t } = useI18n();
  if (!rows.length) {
    return <EmptyState message={t("reports.priorityEmpty")} />;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>{t("reports.priority")}</th>
          <th>{t("common.customer")}</th>
          <th>{t("common.country")}</th>
          <th>{t("common.stage")}</th>
          <th>{t("common.score")}</th>
          <th>{t("common.owner")}</th>
          <th>{t("reports.nextTask")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((customer) => (
          <tr key={customer.id}>
            <td>
              <span
                className={`priority-pill ${(customer.priority_level ?? "C").toLowerCase()}`}
                title={customer.priority_reason}
              >
                {customer.priority_level ?? "-"}
              </span>
            </td>
            <td>
              {customer.name}
              {customer.priority_tags && customer.priority_tags.length > 0 ? (
                <div className="inline-tags">
                  {customer.priority_tags.map((tag) => (
                    <span className="mini-tag" key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </td>
            <td>{customer.country ?? "-"}</td>
            <td><span className="status-pill">{stageLabel(customer.stage, locale)}</span></td>
            <td>{customer.score ?? "-"} {customer.grade ? `(${customer.grade})` : ""}</td>
            <td>{customer.owner_name}</td>
            <td>{customer.next_task_due_at ? formatDateTime(customer.next_task_due_at) : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
