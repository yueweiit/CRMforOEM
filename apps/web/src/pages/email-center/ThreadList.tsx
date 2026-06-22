import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui/EmptyState";

export type EmailThread = {
  id: string;
  subject: string;
  customer?: { id: string; name: string };
  lastMessageAt?: string;
  messages?: Array<{ direction: string; status: string; subject: string; createdAt: string }>;
};

export function ThreadList({ threads }: { threads: EmailThread[] }) {
  return (
    <section className="table-panel">
      <div className="panel-title">
        <h2>邮件往来记录</h2>
        <span>{threads.length} 条线程</span>
      </div>
      {threads.length ? (
        <table>
          <thead>
            <tr>
              <th>主题</th>
              <th>客户</th>
              <th>最近邮件</th>
              <th>状态</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {threads.map((thread) => (
              <tr key={thread.id}>
                <td>{thread.subject}</td>
                <td>
                  {thread.customer ? (
                    <Link className="table-link" to={`/customers/${thread.customer.id}/email`}>
                      {thread.customer.name}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td>{thread.messages?.[0]?.direction ?? "-"}</td>
                <td>{thread.messages?.[0]?.status ?? "-"}</td>
                <td>{thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState message="暂无邮件往来。" />
      )}
    </section>
  );
}
