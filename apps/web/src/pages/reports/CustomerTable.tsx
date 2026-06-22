import { stageLabel } from "@oem-crm/shared";
import { EmptyState } from "../../components/ui/EmptyState";
import type { ReportCustomerRow } from "../../types/customer";

export function CustomerTable({ rows, mode }: { rows: ReportCustomerRow[]; mode: "value" | "risk" }) {
  if (!rows.length) return <EmptyState message="暂无客户数据。" />;
  return (
    <table>
      <thead>
        <tr>
          <th>客户</th>
          <th>国家</th>
          <th>阶段</th>
          <th>{mode === "value" ? "评分/金额" : "风险/逾期"}</th>
          <th>负责人</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((customer) => (
          <tr key={customer.id}>
            <td>{customer.name}</td>
            <td>{customer.country ?? "-"}</td>
            <td><span className="status-pill">{stageLabel(customer.stage)}</span></td>
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
