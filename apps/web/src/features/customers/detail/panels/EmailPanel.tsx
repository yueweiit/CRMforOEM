import { useQuery } from "@tanstack/react-query";
import { getCustomerEmailThreads } from "../../../../api/customers";
import type { CustomerDetail, EmailThread } from "../shared/types";
import { SimpleRows } from "../shared/ui";
import { EmailDraftGenerationForm } from "./email/EmailDraftGenerationForm";
import { EmailDraftHistory } from "./email/EmailDraftHistory";
import { QuoteReplySuggestions } from "./email/QuoteReplySuggestions";
import { useI18n } from "../../../../i18n";

export function EmailPanel({
  customer,
  customerId,
  onChanged
}: {
  customer: CustomerDetail;
  customerId: string;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { data: threads = [] } = useQuery({
    queryKey: ["email-threads", customerId],
    queryFn: () => getCustomerEmailThreads<EmailThread[]>(customerId)
  });

  return (
    <div className="page-stack">
      <EmailDraftGenerationForm contacts={customer.contacts} customerId={customerId} onChanged={onChanged} />
      <QuoteReplySuggestions customerId={customerId} onChanged={onChanged} />
      <EmailDraftHistory customerId={customerId} onChanged={onChanged} />
      <section className="table-panel">
        <div className="panel-title">
          <h2>{t("emailCenter.threadsTitle")}</h2>
          <span>{threads.length} {t("emailCenter.threadUnit")}</span>
        </div>
        <SimpleRows
          rows={threads.map((thread) => ({
            id: thread.id,
            title: thread.subject,
            meta: `${thread.messages?.[0]?.direction ?? "-"} · ${thread.messages?.[0]?.status ?? "-"} · ${
              thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "-"
            }`
          }))}
          empty={t("emailCenter.emptyThreads")}
        />
      </section>
    </div>
  );
}
