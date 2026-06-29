import { useQuery } from "@tanstack/react-query";
import { getCustomerEmailThreads } from "../../../../api/customers";
import type { CustomerDetail, EmailThread } from "../shared/types";
import { SimpleRows } from "../shared/ui";
import { EmailDraftGenerationForm } from "./email/EmailDraftGenerationForm";
import { EmailDraftHistory } from "./email/EmailDraftHistory";

export function EmailPanel({
  customer,
  customerId,
  onChanged
}: {
  customer: CustomerDetail;
  customerId: string;
  onChanged: () => void;
}) {
  const { data: threads = [] } = useQuery({
    queryKey: ["email-threads", customerId],
    queryFn: () => getCustomerEmailThreads<EmailThread[]>(customerId)
  });

  return (
    <div className="page-stack">
      <EmailDraftGenerationForm contacts={customer.contacts} customerId={customerId} onChanged={onChanged} />
      <EmailDraftHistory customerId={customerId} onChanged={onChanged} />
      <section className="table-panel">
        <div className="panel-title">
          <h2>邮件线程</h2>
          <span>{threads.length} 条</span>
        </div>
        <SimpleRows
          rows={threads.map((thread) => ({
            id: thread.id,
            title: thread.subject,
            meta: `${thread.messages?.[0]?.direction ?? "-"} · ${thread.messages?.[0]?.status ?? "-"} · ${
              thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "-"
            }`
          }))}
          empty="暂无邮件往来。"
        />
      </section>
    </div>
  );
}
