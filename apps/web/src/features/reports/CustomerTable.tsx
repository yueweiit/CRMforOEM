import { stageLabel } from "@oem-crm/shared";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n";
import type { ReportCustomerRow } from "../../shared/types/customer";

export function CustomerTable({ rows, mode }: { rows: ReportCustomerRow[]; mode: "value" | "risk" }) {
  const { locale, t } = useI18n();
  if (!rows.length) return <EmptyState message={t("common.noData")} />;
  return (
    <table>
      <thead>
        <tr>
          <th>{t("common.customer")}</th>
          <th>{t("common.country")}</th>
          <th>{t("common.stage")}</th>
          <th>{mode === "value" ? t("reports.scoreAmount") : t("reports.riskOverdue")}</th>
          <th>{t("common.owner")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((customer) => (
          <tr key={customer.id}>
            <td>{customer.name}</td>
            <td>{customer.country ?? "-"}</td>
            <td><span className="status-pill">{stageLabel(customer.stage, locale)}</span></td>
            <td>
              {mode === "value"
                ? `${customer.score ?? "-"} ${customer.grade ? `(${customer.grade})` : ""} / ${customer.quote_amount ?? 0}`
                : `${customer.risk_level ?? "-"} / ${customer.overdue_tasks ?? 0}`}
            </td>
            <td>{customer.owner_name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
