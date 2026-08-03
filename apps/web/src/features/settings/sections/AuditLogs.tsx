import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "../../../api/settings";
import { useI18n } from "../../../i18n";
import { Table } from "../shared/Table";
import type { AuditLog } from "../shared/types";

export function AuditLogs() {
  const { t } = useI18n();
  const { data = [] } = useQuery({ queryKey: ["audit-logs"], queryFn: () => getAuditLogs<AuditLog[]>() });
  return <Table headers={[t("settings.auditAction"), t("settings.auditObject"), t("settings.auditActor"), t("settings.auditTime")]} rows={data.map((log) => [log.action, `${log.entityType}:${log.entityId ?? "-"}`, log.actor?.name ?? "-", new Date(log.createdAt).toLocaleString()])} />;
}
