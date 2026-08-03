import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n";

export type EmailThread = {
  id: string;
  subject: string;
  customer?: { id: string; name: string };
  lastMessageAt?: string;
  messages?: Array<{ direction: string; status: string; subject: string; createdAt: string }>;
};

export function ThreadList({ threads }: { threads: EmailThread[] }) {
  const { t } = useI18n();
  return (
    <section className="table-panel">
      <div className="panel-title">
        <h2>{t("emailCenter.threadsTitle")}</h2>
        <span>{threads.length} {t("common.itemCount")}</span>
      </div>
      {threads.length ? (
        <table>
          <thead>
            <tr>
              <th>{t("emailCenter.subject")}</th>
              <th>{t("common.customer")}</th>
              <th>{t("emailCenter.recentEmail")}</th>
              <th>{t("common.status")}</th>
              <th>{t("emailCenter.time")}</th>
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
        <EmptyState message={t("emailCenter.emptyThreads")} />
      )}
    </section>
  );
}
