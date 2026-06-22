import { EmptyState } from "../../components/ui/EmptyState";
import { Switch } from "../../components/Switch";

export type EmailAccount = {
  id: string;
  scope: "PERSONAL" | "SHARED";
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  dailySendLimit: number;
  hourlySendLimit: number;
  isActive: boolean;
  lastSyncAt?: string;
};

export type EmailSyncAccountStatus = {
  accountId: string;
  connectionStatus: "connecting" | "idle" | "fetching" | "reconnecting" | "disconnected" | "auth_failed";
  lastSyncAt?: string | null;
  lastError?: string;
  nextReconnectAt?: string | null;
};

export function AccountTable({
  rows,
  statuses,
  onEdit,
  onTest,
  onToggle
}: {
  rows: EmailAccount[];
  statuses: EmailSyncAccountStatus[];
  onEdit: (account: EmailAccount) => void;
  onTest: (id: string) => void;
  onToggle: (account: EmailAccount) => void;
}) {
  if (!rows.length) return <EmptyState message="暂无邮箱账号。" />;

  const statusByAccount = new Map(statuses.map((status) => [status.accountId, status]));

  return (
    <table>
      <thead>
        <tr>
          <th>名称</th>
          <th>邮箱</th>
          <th>范围</th>
          <th>SMTP/IMAP</th>
          <th>上限</th>
          <th>同步状态</th>
          <th>启用</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((account) => {
          const status = statusByAccount.get(account.id);
          return (
            <tr key={account.id}>
              <td>{account.name}</td>
              <td>{account.email}</td>
              <td>{account.scope === "SHARED" ? "共享" : "个人"}</td>
              <td>
                {account.smtpHost}:{account.smtpPort} / {account.imapHost}:{account.imapPort}
              </td>
              <td>
                {account.hourlySendLimit}/小时 / {account.dailySendLimit}/天
              </td>
              <td>
                <div className="stacked-cell">
                  <span className="status-pill">{syncStatusLabel(status?.connectionStatus, account.isActive)}</span>
                  <span>{formatSyncTime(status?.lastSyncAt ?? account.lastSyncAt)}</span>
                  {status?.lastError ? <small>{status.lastError}</small> : null}
                </div>
              </td>
              <td>
                <Switch checked={account.isActive} onChange={() => onToggle(account)} />
              </td>
              <td>
                <div className="toolbar">
                  <button className="secondary-button" onClick={() => onEdit(account)}>
                    编辑
                  </button>
                  <button className="secondary-button" onClick={() => onTest(account.id)}>
                    测试
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function syncStatusLabel(status?: EmailSyncAccountStatus["connectionStatus"], isActive?: boolean) {
  if (!isActive) return "未启用";

  const labels: Record<EmailSyncAccountStatus["connectionStatus"], string> = {
    idle: "监听中",
    fetching: "同步中",
    connecting: "连接中",
    reconnecting: "重连中",
    disconnected: "未连接",
    auth_failed: "认证失败"
  };

  return status ? labels[status] : "未连接";
}

function formatSyncTime(value?: string | null) {
  return value ? `最近同步 ${new Date(value).toLocaleString()}` : "尚未同步";
}
