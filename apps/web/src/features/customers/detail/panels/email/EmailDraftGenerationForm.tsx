import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EMAIL_DRAFT_PURPOSES, emailDraftPurposeLabel } from "@oem-crm/shared";
import { getEmailAccounts } from "../../../../../api/email";
import { generateEmailDraft } from "../../../../../api/customers";
import { AppSelect } from "../../../../../components/AppSelect";
import { showClientToast } from "../../../../../components/Toast";
import { sameEmailAddress } from "../../../../../shared/utils/email-format";
import type { AcceptedResponse, Contact, EmailAccount } from "../../shared/types";
import { cleanPayload, invalidateEmailData } from "./email-panel-utils";

type DraftForm = {
  purpose: string;
  toEmail: string;
  emailAccountId: string;
  userInstructions: string;
};

export function EmailDraftGenerationForm({
  contacts,
  customerId,
  onChanged
}: {
  contacts: Contact[];
  customerId: string;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const contactOptions = contacts.filter((contact) => Boolean(contact.email));
  const [draftForm, setDraftForm] = useState<DraftForm>({
    purpose: "FIRST_OUTREACH",
    toEmail: contactOptions[0]?.email ?? "",
    emailAccountId: "",
    userInstructions: ""
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: () => getEmailAccounts<EmailAccount[]>()
  });
  const selectableAccounts = accounts.filter((account) => !sameEmailAddress(account.email, draftForm.toEmail));

  useEffect(() => {
    const selectedAccount = accounts.find((account) => account.id === draftForm.emailAccountId);
    if (selectedAccount && sameEmailAddress(selectedAccount.email, draftForm.toEmail)) {
      setDraftForm((current) => ({ ...current, emailAccountId: "" }));
    }
  }, [accounts, draftForm.emailAccountId, draftForm.toEmail]);

  const generate = useMutation({
    mutationFn: () =>
      generateEmailDraft<AcceptedResponse<{ id: string; status: string; message: string }>>(
        customerId,
        cleanPayload(draftForm)
      ),
    onSuccess: (response) => {
      if (response.accepted === false) {
        showClientToast({
          type: "warning",
          title: "邮件草稿生成中",
          message: "已有邮件草稿正在后台生成中，请稍后刷新查看。"
        });
      }
      invalidateEmailData(queryClient, customerId, onChanged);
      queryClient.invalidateQueries({ queryKey: ["customer-background-tasks", customerId] });
    }
  });

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>AI邮件生成</h2>
        <span>只生成草稿，人工审核后发送</span>
      </div>
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
              ...contactOptions.map((contact) => ({
                value: contact.email ?? "",
                label: `${contact.name || contact.email} · ${contact.email}`
              }))
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
              ...selectableAccounts.map((account) => ({
                value: account.id,
                label: `${account.name} · ${account.email} ${account.scope === "SHARED" ? "(共享)" : ""}`
              }))
            ]}
          />
        </label>
        <label className="wide-field">
          <span>补充要求</span>
          <textarea
            value={draftForm.userInstructions}
            onChange={(event) => setDraftForm({ ...draftForm, userInstructions: event.target.value })}
          />
        </label>
        <div className="wide-field">
          <button
            className="primary-button"
            disabled={!draftForm.toEmail || !selectableAccounts.length || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? "生成中..." : "生成AI草稿"}
          </button>
        </div>
        {!selectableAccounts.length && draftForm.toEmail ? (
          <div className="wide-field empty-state">
            当前没有可用发件邮箱，或可用发件邮箱与收件人邮箱相同。
          </div>
        ) : null}
      </div>
    </section>
  );
}
