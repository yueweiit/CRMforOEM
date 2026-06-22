import { stageLabel } from "@oem-crm/shared";
import { EmptyState } from "../../components/ui/EmptyState";
import { formatDateTime } from "../../utils/format";
import type { PriorityCustomerRow } from "../../types/customer";

export function PriorityCustomerTable({ rows }: { rows: PriorityCustomerRow[] }) {
  if (!rows.length) {
    return <EmptyState message="暂无高优先级客户。" />;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>优先级</th>
          <th>客户</th>
          <th>国家</th>
          <th>阶段</th>
          <th>评分</th>
          <th>负责人</th>
          <th>下一任务</th>
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
            <td><span className="status-pill">{stageLabel(customer.stage)}</span></td>
            <td>{customer.score ?? "-"} {customer.grade ? `(${customer.grade})` : ""}</td>
            <td>{customer.owner_name}</td>
            <td>{customer.next_task_due_at ? formatDateTime(customer.next_task_due_at) : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
