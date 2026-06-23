import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";
import { EMAIL_DRAFT_PURPOSES, emailDraftPurposeLabel } from "@oem-crm/shared";
import { getEmailAccounts, updateEmailDraft, approveEmailDraft, sendEmailDraft } from "../../../../api/email";
import { getCustomerEmailDrafts, getCustomerEmailThreads, generateEmailDraft } from "../../../../api/customers";
import { AppSelect } from "../../../../components/AppSelect";
import { showClientToast } from "../../../../components/Toast";
import { sameEmailAddress } from "../../../../shared/utils/email-format";
import type { CustomerDetail, EmailDraft, EmailThread, EmailAccount, AcceptedResponse } from "../shared/types";
import { SimpleRows, AiVersions, AutoResizeTextarea } from "../shared/ui";

function formatDraftSender(draft: EmailDraft) {
  if (draft.fromEmailSnapshot) return draft.fromNameSnapshot ? `${draft.fromNameSnapshot} · ${draft.fromEmailSnapshot}` : draft.fromEmailSnapshot;
  if (draft.emailAccount) return `${draft.emailAccount.name} · ${draft.emailAccount.email}`;
  return "未选择发件邮箱";
}

function formatDraftRecipient(draft: EmailDraft) {
  return draft.toNameSnapshot ? `${draft.toNameSnapshot} · ${draft.toEmail}` : draft.toEmail;
}

function cleanPayload(input: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value));
}

function invalidateEmail(queryClient: ReturnType<typeof useQueryClient>, customerId: string, onChanged: () => void) {
  queryClient.invalidateQueries({ queryKey: ["email-drafts", customerId] });
  queryClient.invalidateQueries({ queryKey: ["email-threads", customerId] });
  onChanged();
}

export function EmailPanel({ customer, customerId, onChanged }: { customer: CustomerDetail; customerId: string; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const contactOptions = customer.contacts.filter((contact) => Boolean(contact.email));
  const [draftForm, setDraftForm] = useState({ purpose: "FIRST_OUTREACH", toEmail: contactOptions[0]?.email ?? "", emailAccountId: "", userInstructions: "" });
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const { data: accounts = [] } = useQuery({ queryKey: ["email-accounts"], queryFn: () => getEmailAccounts<EmailAccount[]>() });
  const selectableAccounts = accounts.filter((account) => !sameEmailAddress(account.email, draftForm.toEmail));
  useEffect(() => {
    const selectedAccount = accounts.find((account) => account.id === draftForm.emailAccountId);
    if (selectedAccount && sameEmailAddress(selectedAccount.email, draftForm.toEmail)) {
      setDraftForm((current) => ({ ...current, emailAccountId: "" }));
    }
  }, [accounts, draftForm.emailAccountId, draftForm.toEmail]);
  const { data: drafts = [] } = useQuery({
    queryKey: ["email-drafts", customerId],
    queryFn: () => getCustomerEmailDrafts<EmailDraft[]>(customerId),
    refetchInterval: (query) => {
      const data = query.state.data as EmailDraft[] | undefined;
      const hasGenerating = data?.some((draft) => !draft.body);
      return hasGenerating ? 3000 : false;
    }
  });
  const { data: threads = [] } = useQuery({ queryKey: ["email-threads", customerId], queryFn: () => getCustomerEmailThreads<EmailThread[]>(customerId) });
  const generate = useMutation({
    mutationFn: () => generateEmailDraft<AcceptedResponse<{ id: string; status: string; message: string }>>(customerId, cleanPayload(draftForm)),
    onSuccess: (response) => {
      if (response.accepted === false) {
        showClientToast({ type: "warning", title: "邮件草稿生成中", message: "已有邮件草稿正在后台生成中，请稍后刷新查看。" });
      }
      invalidateEmail(queryClient, customerId, onChanged);
      queryClient.invalidateQueries({ queryKey: ["customer-background-tasks", customerId] });
    }
  });
  const update = useMutation({ mutationFn: (draft: EmailDraft) => updateEmailDraft(draft.id, cleanPayload({ subject: editDraft[`subject:${draft.id}`] ?? draft.subject, body: editDraft[`body:${draft.id}`] ?? draft.body, emailAccountId: editDraft[`account:${draft.id}`] ?? draft.emailAccountId })), onSuccess: () => invalidateEmail(queryClient, customerId, onChanged) });
  const approve = useMutation({ mutationFn: (draftId: string) => approveEmailDraft(draftId), onSuccess: () => invalidateEmail(queryClient, customerId, onChanged) });
  const send = useMutation({
    mutationFn: (draft: EmailDraft) => sendEmailDraft(draft.id, { toast: false }).then((result) => ({ result, draft })),
    onSuccess: ({ draft }) => {
      const isSampleFollowUp = draft.purpose === "SAMPLE_FOLLOW_UP";
      showClientToast({
        type: "success",
        title: isSampleFollowUp ? "样品跟进邮件已发送" : "邮件已发送",
        message: isSampleFollowUp ? "请前往样品页更新样品状态，并继续跟进客户。" : "邮件已成功发送给客户。"
      });
      invalidateEmail(queryClient, customerId, onChanged);
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "邮件发送失败",
        message: error instanceof Error ? error.message : "邮件发送失败"
      });
    }
  });

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-title"><h2>AI邮件生成</h2><span>只生成草稿，人工审核后发送</span></div>
        <div className="form-grid">
          <label>
            <span>邮件类型</span>
            <AppSelect
              value={draftForm.purpose}
              onChange={(purpose) => setDraftForm({ ...draftForm, purpose })}
              options={EMAIL_DRAFT_PURPOSES.map((purpose) => ({ value: purpose, label: emailDraftPurposeLabel(purpose) }))}
            />
          </label>
          <label>
            <span>收件人</span>
            <AppSelect
              value={draftForm.toEmail}
              onChange={(toEmail) => setDraftForm({ ...draftForm, toEmail })}
              options={[
                { value: "", label: "选择联系人邮箱" },
                ...contactOptions.map((contact) => ({ value: contact.email ?? "", label: `${contact.name || contact.email} · ${contact.email}` }))
              ]}
            />
          </label>
          <label>
            <span>发件邮箱</span>
            <AppSelect
              value={draftForm.emailAccountId}
              onChange={(emailAccountId) => setDraftForm({ ...draftForm, emailAccountId })}
              options={[
                { value: "", label: "发送时自动选择" },
                ...selectableAccounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.email} ${account.scope === "SHARED" ? "(共享)" : ""}` }))
              ]}
            />
          </label>
          <label className="wide-field"><span>补充要求</span><textarea value={draftForm.userInstructions} onChange={(event) => setDraftForm({ ...draftForm, userInstructions: event.target.value })} /></label>
          <div className="wide-field"><button className="primary-button" disabled={!draftForm.toEmail || !selectableAccounts.length || generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? "生成中..." : "生成AI草稿"}</button></div>
          {!selectableAccounts.length && draftForm.toEmail ? <div className="wide-field empty-state">当前没有可用发件邮箱，或可用发件邮箱与收件人邮箱相同。</div> : null}
        </div>
      </section>
      <section className="table-panel">
        <div className="panel-title"><h2>邮件草稿</h2><span>{drafts.length} 封</span></div>
        {!drafts.length ? <div className="empty-state">暂无邮件草稿。</div> : drafts.map((draft) => (
          <div className="draft-editor" key={draft.id}>
             <div className="task-row">
              <MailPlus size={16} />
              <div>
                <strong>邮件类型：{emailDraftPurposeLabel(draft.purpose)}</strong>
                <span>发件人：{formatDraftSender(draft)}</span>
                <span>收件人：{formatDraftRecipient(draft)}</span>
              </div>
              <span className="status-pill">{draft.status}</span>
            </div>
            <input value={editDraft[`subject:${draft.id}`] ?? draft.subject} onChange={(event) => setEditDraft({ ...editDraft, [`subject:${draft.id}`]: event.target.value })} />
            {draft.body ? (
              <AutoResizeTextarea value={editDraft[`body:${draft.id}`] ?? draft.body} onChange={(event) => setEditDraft({ ...editDraft, [`body:${draft.id}`]: event.target.value })} />
            ) : (
              <div className="loading-state">⏳ 稿件生成中，请稍候...</div>
            )}
            <div className="toolbar">
              <button className="secondary-button" onClick={() => update.mutate(draft)}>保存修改</button>
              <button className="secondary-button" onClick={() => approve.mutate(draft.id)}>审核通过</button>
              <button className="primary-button" disabled={draft.status !== "APPROVED"} onClick={() => send.mutate(draft)}>发送邮件</button>
            </div>
            <AiVersions run={draft.aiGenerationRun} />
          </div>
        ))}
      </section>
      <section className="table-panel">
        <div className="panel-title"><h2>邮件线程</h2><span>{threads.length} 条</span></div>
        <SimpleRows rows={threads.map((thread) => ({ id: thread.id, title: thread.subject, meta: `${thread.messages?.[0]?.direction ?? "-"} · ${thread.messages?.[0]?.status ?? "-"} · ${thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "-"}` }))} empty="暂无邮件往来。" />
      </section>
    </div>
  );
}
