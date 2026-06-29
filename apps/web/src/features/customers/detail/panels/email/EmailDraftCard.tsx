import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";
import { emailDraftPurposeLabel } from "@oem-crm/shared";
import { approveEmailDraft, getEmailDraft, sendEmailDraft, updateEmailDraft } from "../../../../../api/email";
import { showClientToast } from "../../../../../components/Toast";
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
        title: isSampleFollowUp ? "样品跟进邮件已发送" : "邮件已发送",
        message: isSampleFollowUp ? "请前往样品页更新样品状态，并继续跟进客户。" : "邮件已成功发送给客户。"
      });
      queryClient.invalidateQueries({ queryKey: ["email-draft", draft.id] });
      invalidateEmailData(queryClient, customerId, onChanged);
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
    <article className="draft-editor email-draft-card">
      <button className="email-draft-summary" type="button" onClick={() => setExpanded((current) => !current)}>
        <MailPlus size={16} />
        <div>
          <strong>邮件类型：{emailDraftPurposeLabel(draft.purpose)}</strong>
          <span>主题：{draft.subject || "等待生成主题"}</span>
          <span>发件人：{formatDraftSender(draft, { fallback: "未选择发件邮箱", separator: " · " })}</span>
          <span>收件人：{formatDraftRecipient(draft, { separator: " · " })}</span>
        </div>
        <span className="status-pill">{draft.status}</span>
      </button>

      {expanded ? (
        detailQuery.isLoading ? (
          <div className="loading-state">邮件内容加载中...</div>
        ) : detailQuery.isError ? (
          <div className="empty-state">邮件内容加载失败，请稍后重试。</div>
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
              <div className="loading-state">草稿生成中，请稍候...</div>
            )}
            <div className="toolbar">
              <button className="secondary-button" disabled={update.isPending || !editableDraft.body} onClick={() => update.mutate()}>
                {update.isPending ? "保存中..." : "保存修改"}
              </button>
              <button className="secondary-button" disabled={approve.isPending || !editableDraft.body} onClick={() => approve.mutate()}>
                {approve.isPending ? "审核中..." : "审核通过"}
              </button>
              <button
                className="primary-button"
                disabled={send.isPending || editableDraft.status !== "APPROVED"}
                onClick={() => send.mutate()}
              >
                {send.isPending ? "发送中..." : "发送邮件"}
              </button>
            </div>
            <AiVersions run={detail?.aiGenerationRun} />
          </div>
        )
      ) : null}
    </article>
  );
}
