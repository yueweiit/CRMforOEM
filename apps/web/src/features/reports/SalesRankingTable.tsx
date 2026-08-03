import { useI18n } from "../../i18n";

export type SalesRankingRow = {
  owner_id: string;
  owner_name: string;
  customer_total: number;
  new_customers: number;
  researched_customers: number;
  sent_emails: number;
  replied_customers: number;
  quoted_customers: number;
  sample_customers: number;
  won_customers: number;
  won_rate: number;
};

export function SalesRankingTable({ rows }: { rows: SalesRankingRow[] }) {
  const { t } = useI18n();
  if (!rows.length) return <div className="empty-state">{t("reports.salesEmpty")}</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>{t("reports.salesRep")}</th>
          <th>{t("reports.customers")}</th>
          <th>{t("reports.newCustomers")}</th>
          <th>{t("reports.research")}</th>
          <th>{t("reports.sent")}</th>
          <th>{t("reports.replied")}</th>
          <th>{t("reports.quotes")}</th>
          <th>{t("reports.samples")}</th>
          <th>{t("reports.won")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.owner_id}>
            <td>{row.owner_name}</td>
            <td>{row.customer_total}</td>
            <td>{row.new_customers}</td>
            <td>{row.researched_customers}</td>
            <td>{row.sent_emails}</td>
            <td>{row.replied_customers}</td>
            <td>{row.quoted_customers}</td>
            <td>{row.sample_customers}</td>
            <td>{row.won_customers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
