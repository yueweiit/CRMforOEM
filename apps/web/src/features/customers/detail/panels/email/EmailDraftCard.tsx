import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, MailPlus, Paperclip, Upload } from "lucide-react";
import { emailDraftPurposeLabel, emailDraftStatusLabel } from "@oem-crm/shared";
import {
  approveEmailDraft,
  deleteEmailDraftAttachment,
  getEmailAttachmentUrl,
  getEmailDraft,
  sendEmailDraft,
  updateEmailDraft,
  uploadEmailDraftAttachment
} from "../../../../../api/email";
import { DeleteIconButton } from "../../../../../components/DeleteIconButton";
import { showClientToast } from "../../../../../components/Toast";
import { useI18n } from "../../../../../i18n";
import { formatDraftRecipient, formatDraftSender } from "../../../../../shared/utils/email-format";
import type { EmailDraft, EmailDraftListItem } from "../../shared/types";
import { AiVersions, AutoResizeTextarea } from "../../shared/ui";
import { cleanPayload, invalidateEmailData } from "./email-panel-utils";

export function EmailDraftCard({
  customerId,
  draft,
  expanded,
  onToggle,
  onChanged
}: {
  customerId: string;
  draft: EmailDraftListItem;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  async function refreshDraft() {
    await queryClient.invalidateQueries({ queryKey: ["email-draft", draft.id] });
    invalidateEmailData(queryClient, customerId, onChanged);
  }

  async function uploadAttachments(files: FileList | null) {
    if (!files?.length) return;
    setAttachmentBusy(true);
    try {
      for (const file of Array.from(files)) {
        await uploadEmailDraftAttachment(draft.id, file, { toast: false });
      }
      await refreshDraft();
      showClientToast({
        type: "success",
        title: t("emailCenter.attachmentUploadSuccess"),
        message: t("emailCenter.attachmentReviewRequired")
      });
    } catch (error) {
      showClientToast({
        type: "error",
        title: t("emailCenter.attachmentUploadFailed"),
        message: error instanceof Error ? error.message : t("emailCenter.attachmentUploadFailed")
      });
      await refreshDraft();
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    setAttachmentBusy(true);
    try {
      await deleteEmailDraftAttachment(draft.id, attachmentId, { toast: false });
      await refreshDraft();
    } catch (error) {
      showClientToast({
        type: "error",
        title: t("emailCenter.attachmentDeleteFailed"),
        message: error instanceof Error ? error.message : t("emailCenter.attachmentDeleteFailed")
      });
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function openAttachment(fileAssetId: string) {
    try {
      const file = await getEmailAttachmentUrl(fileAssetId);
      window.open(file.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      showClientToast({
        type: "error",
        title: t("emailCenter.attachmentOpenFailed"),
        message: error instanceof Error ? error.message : t("emailCenter.attachmentOpenFailed")
      });
    }
  }

  return (
    <article className={`draft-editor email-draft-card${expanded ? " is-expanded" : ""}`}>
      <button className="email-draft-summary" type="button" onClick={onToggle}>
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
            {editableDraft.quoteId ? (
              <div className="email-linked-quote">
                <strong>{t("emailCenter.linkedQuote")}</strong>
                <span>{editableDraft.quoteSnapshot?.quoteNo ?? editableDraft.quoteId} · {editableDraft.quoteSnapshot?.productName ?? ""}</span>
              </div>
            ) : null}
            <input
              disabled={editableDraft.status === "SENT"}
              value={editDraft.subject ?? editableDraft.subject}
              onChange={(event) => setEditDraft({ ...editDraft, subject: event.target.value })}
            />
            {editableDraft.body ? (
              <AutoResizeTextarea
                disabled={editableDraft.status === "SENT"}
                className="email-draft-body-editor"
                value={editDraft.body ?? editableDraft.body}
                onChange={(event) => setEditDraft({ ...editDraft, body: event.target.value })}
              />
            ) : (
              <div className="loading-state">{t("emailCenter.generatingDraftBody")}</div>
            )}
            <section className="email-draft-attachments" aria-label={t("emailCenter.attachments")}>
              <div className="email-draft-attachments-header">
                <div>
                  <Paperclip size={16} />
                  <strong>{t("emailCenter.attachments")}</strong>
                  <span>{editableDraft.attachments?.length ?? 0}/5</span>
                </div>
                {editableDraft.status !== "SENT" ? (
                  <>
                    <button
                      className="secondary-button email-attachment-upload-button"
                      disabled={attachmentBusy || (editableDraft.attachments?.length ?? 0) >= 5}
                      onClick={() => fileInputRef.current?.click()}
                      type="button"
                    >
                      <Upload size={14} />
                      {attachmentBusy ? t("common.processing") : t("emailCenter.uploadAttachments")}
                    </button>
                    <input
                      ref={fileInputRef}
                      accept=".csv,.doc,.docx,.gif,.jpeg,.jpg,.pdf,.png,.ppt,.pptx,.txt,.webp,.xls,.xlsx,.zip"
                      hidden
                      multiple
                      onChange={(event) => {
                        void uploadAttachments(event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                      type="file"
                    />
                  </>
                ) : null}
              </div>
              {editableDraft.attachments?.length ? (
                <div className="email-attachment-list">
                  {editableDraft.attachments.map((attachment) => (
                    <div className="email-attachment-row" key={attachment.id}>
                      <Paperclip aria-hidden="true" size={15} />
                      <div>
                        <strong title={attachment.filename}>{attachment.filename}</strong>
                        <span>{formatAttachmentSize(attachment.sizeBytes)}</span>
                      </div>
                      <button
                        aria-label={t("emailCenter.openAttachment")}
                        className="secondary-button icon-button"
                        onClick={() => void openAttachment(attachment.fileAssetId)}
                        title={t("emailCenter.openAttachment")}
                        type="button"
                      >
                        <Download size={14} />
                      </button>
                      {editableDraft.status !== "SENT" ? (
                        <DeleteIconButton
                          disabled={attachmentBusy}
                          label={t("emailCenter.deleteAttachment")}
                          onClick={() => void removeAttachment(attachment.id)}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="email-attachment-empty">{t("emailCenter.noAttachments")}</span>
              )}
              {editableDraft.status !== "SENT" ? (
                <span className="email-attachment-limit">{t("emailCenter.attachmentLimitHint")}</span>
              ) : null}
            </section>
            <div className="toolbar">
              <button className="secondary-button" disabled={update.isPending || !editableDraft.body || editableDraft.status === "SENT"} onClick={() => update.mutate()}>
                {update.isPending ? t("common.saving") : t("common.saveChanges")}
              </button>
              <button className="secondary-button" disabled={approve.isPending || !editableDraft.body || editableDraft.status === "SENT"} onClick={() => approve.mutate()}>
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

function formatAttachmentSize(sizeBytes?: number | null) {
  if (sizeBytes === undefined || sizeBytes === null) return "-";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
