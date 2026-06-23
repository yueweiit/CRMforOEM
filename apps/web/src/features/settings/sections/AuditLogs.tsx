import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "../../../api/settings";
import { Table } from "../shared/Table";
import type { AuditLog } from "../shared/types";

export function AuditLogs() {
  const { data = [] } = useQuery({ queryKey: ["audit-logs"], queryFn: () => getAuditLogs<AuditLog[]>() });
  return <Table headers={["操作", "对象", "操作者", "时间"]} rows={data.map((log) => [log.action, `${log.entityType}:${log.entityId ?? "-"}`, log.actor?.name ?? "-", new Date(log.createdAt).toLocaleString()])} />;
}
