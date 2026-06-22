import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/http";
import { Table } from "./Table";
import type { AuditLog } from "./types";

export function AuditLogs() {
  const { data = [] } = useQuery({ queryKey: ["audit-logs"], queryFn: () => apiGet<AuditLog[]>("/settings/audit-logs") });
  return <Table headers={["操作", "对象", "操作者", "时间"]} rows={data.map((log) => [log.action, `${log.entityType}:${log.entityId ?? "-"}`, log.actor?.name ?? "-", new Date(log.createdAt).toLocaleString()])} />;
}
