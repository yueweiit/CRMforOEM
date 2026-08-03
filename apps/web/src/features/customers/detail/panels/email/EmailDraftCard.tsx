import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";
import { emailDraftPurposeLabel, emailDraftStatusLabel } from "@oem-crm/shared";
import { approveEmailDraft, getEmailDraft, sendEmailDraft, updateEmailDraft } from "../../../../../api/email";
import { showClientToast } from "../../../../../components/Toast";
import { useI18n } from "../../../../../i18n";
import { formatDraftRecipient, formatDraftSender } from "../../../../../shared/utils/email-format";
import type { EmailDraft, EmailDraftListItem } from "../../shared/types";
import { AiVersions } from "../../shared/ui";
import { cleanPayload, invalidateEmailData } from "./email-panel-utils";

export function EmailDraftCard({
  customerId,
  draft,
  onChanged
}: {
  customerId: string;
  draft: EmailDraftListItem;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const detailQuery = useQuery({
    queryKey: ["email-draft", draft.id],
    queryFn: () => getEmailDraft<EmailDraft>(draft.id),
    enabled: expanded
  });
  const detail = detailQuery.data;
  const editableDraft = detail ?? ({ ...draft, body: "" } as EmailDraft);

  useEffect(() => {
    if (!expanded) {
      setEditDraft({});
    }
  }, [expanded, draft.id]);

  const update = useMutation({
    mutationFn: () =>
      updateEmailDraft(
        draft.id,
        cleanPayload({
          subject: editDraft.subject ?? editableDraft.subject,
          body: editDraft.body ?? editableDraft.body,
          emailAccountId: editDraft.emailAccountId ?? editableDraft.emailAccountId
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-draft", draft.id] });
      invalidateEmailData(queryClient, customerId, onChanged);
    }
  });
  const approve = useMutation({
    mutationFn: () => approveEmailDraft(draft.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-draft", draft.id] });
      invalidateEmailData(queryClient, customerId, onChanged);
    }
  });
  const send = useMutation({
    mutationFn: () => sendEmailDraft(draft.id, { toast: false }).then((result) => ({ result, draft: editableDraft })),
    onSuccess: ({ draft: sentDraft }) => {
      const isSampleFollowUp = sentDraft.purpose === "SAMPLE_FOLLOW_UP";
      showClientToast({
        type: "success",
        title: isSampleFollowUp ? t("emailCenter.sampleSentSuccessTitle") : t("emailCenter.sentSuccessTitle"),
        message: isSampleFollowUp ? t("emailCenter.sampleSentSuccessMessage") : t("emailCenter.sentSuccessMessage")
      });
      queryClient.invalidateQueries({ queryKey: ["email-draft", draft.id] });
      invalidateEmailData(queryClient, customerId, onChanged);
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: t("emailCenter.sendFailed"),
        message: error instanceof Error ? error.message : t("emailCenter.sendFailed")
      });
    }
  });

  return (
    <article className="draft-editor email-draft-card">
      <button className="email-draft-summary" type="button" onClick={() => setExpanded((current) => !current)}>
        <MailPlus size={16} />
        <div>
          <strong>{t("emailCenter.draftTypePrefix")}{emailDraftPurposeLabel(draft.purpose, locale)}</strong>
          <span>{t("emailCenter.subjectPrefix")}{draft.subject || t("emailCenter.subjectPending")}</span>
          <span>{t("emailCenter.senderPrefix")}{formatDraftSender(draft, { fallback: t("emailCenter.noSenderSelected"), separator: " · " })}</span>
          <span>{t("emailCenter.recipientPrefix")}{formatDraftRecipient(draft, { separator: " · " })}</span>
        </div>
        <span className="status-pill">{emailDraftStatusLabel(draft.status, locale)}</span>
      </button>

      {expanded ? (
        detailQuery.isLoading ? (
          <div className="loading-state">{t("emailCenter.loadingContent")}</div>
        ) : detailQuery.isError ? (
          <div className="empty-state">{t("emailCenter.loadContentError")}</div>
        ) : (
          <div className="email-draft-detail-window">
            <input
              value={editDraft.subject ?? editableDraft.subject}
              onChange={(event) => setEditDraft({ ...editDraft, subject: event.target.value })}
            />
            {editableDraft.body ? (
              <textarea
                className="email-draft-body-editor"
                value={editDraft.body ?? editableDraft.body}
                onChange={(event) => setEditDraft({ ...editDraft, body: event.target.value })}
              />
            ) : (
              <div className="loading-state">{t("emailCenter.generatingDraftBody")}</div>
            )}
            <div className="toolbar">
              <button className="secondary-button" disabled={update.isPending || !editableDraft.body} onClick={() => update.mutate()}>
                {update.isPending ? t("common.saving") : t("common.saveChanges")}
              </button>
              <button className="secondary-button" disabled={approve.isPending || !editableDraft.body} onClick={() => approve.mutate()}>
                {approve.isPending ? t("emailCenter.approving") : t("emailCenter.approve")}
              </button>
              <button
                className="primary-button"
                disabled={send.isPending || editableDraft.status !== "APPROVED"}
                onClick={() => send.mutate()}
              >
                {send.isPending ? t("emailCenter.sending") : t("emailCenter.sendEmail")}
              </button>
            </div>
            <AiVersions run={detail?.aiGenerationRun} />
          </div>
        )
      ) : null}
    </article>
  );
}
