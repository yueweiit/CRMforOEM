import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { CheckCircle2, CircleX, MessageSquareText } from "lucide-react";
import { confirmQuoteReplyAssessment, dismissQuoteReplyAssessment, getQuoteReplyAssessments } from "../../../../../api/email";
import { useI18n } from "../../../../../i18n";
import type { QuoteReplyAssessment } from "../../shared/types";

export function QuoteReplySuggestions({ customerId, onChanged }: { customerId: string; onChanged: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<QuoteReplyAssessment | null>(null);
  const query = useQuery({
    queryKey: ["quote-reply-assessments", customerId],
    queryFn: () => getQuoteReplyAssessments<QuoteReplyAssessment[]>(customerId)
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["quote-reply-assessments", customerId] });
    queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
    onChanged();
  };
  const confirm = useMutation({
    mutationFn: (assessment: QuoteReplyAssessment) => confirmQuoteReplyAssessment(
      assessment.id,
      assessment.intent === "ACCEPT" ? "ACCEPTED" : "CUSTOMER_REJECTED"
    ),
    onSuccess: () => {
      setConfirming(null);
      refresh();
    }
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissQuoteReplyAssessment(id),
    onSuccess: refresh
  });
  const assessments = query.data ?? [];

  return (
    <section className="table-panel quote-reply-suggestions">
      <div className="panel-title">
        <div>
          <h2>{t("emailCenter.quoteReplySuggestions")}</h2>
          <span>{t("emailCenter.quoteReplySuggestionsHint")}</span>
        </div>
        <span>{assessments.length}</span>
      </div>
      {query.isLoading ? <div className="loading-state">{t("emailCenter.loadingSuggestions")}</div> : null}
      {query.isError ? <div className="error-state">{t("emailCenter.loadSuggestionsError")}</div> : null}
      {!query.isLoading && !assessments.length ? <div className="empty-state">{t("emailCenter.noQuoteReplySuggestions")}</div> : null}
      <div className="quote-reply-suggestion-list">
        {assessments.map((assessment) => {
          const actionable = assessment.intent === "ACCEPT" || assessment.intent === "REJECT";
          return (
            <article className="quote-reply-suggestion" key={assessment.id}>
              <div className="quote-reply-suggestion__main">
                <MessageSquareText size={18} />
                <div>
                  <strong>{assessment.quote.quoteNo} · {assessment.quote.productName}</strong>
                  <span>{assessment.inboundEmailMessage.fromEmail} · {assessment.inboundEmailMessage.subject}</span>
                  <blockquote>{assessment.evidence || assessment.reason}</blockquote>
                </div>
              </div>
              <div className="quote-reply-suggestion__actions">
                <span className="status-pill">{replyIntentLabel(assessment.intent, t)} · {Math.round(assessment.confidence * 100)}%</span>
                {actionable ? (
                  <button className="primary-button" type="button" onClick={() => setConfirming(assessment)}>
                    {assessment.intent === "ACCEPT" ? <CheckCircle2 size={15} /> : <CircleX size={15} />}
                    {assessment.intent === "ACCEPT" ? t("emailCenter.confirmCustomerAccepted") : t("emailCenter.confirmCustomerRejected")}
                  </button>
                ) : null}
                <button className="secondary-button" disabled={dismiss.isPending} type="button" onClick={() => dismiss.mutate(assessment.id)}>
                  {t("emailCenter.dismissSuggestion")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <Dialog
        v2
        className="crm-action-dialog"
        title={confirming?.intent === "ACCEPT" ? t("emailCenter.confirmAcceptedTitle") : t("emailCenter.confirmRejectedTitle")}
        visible={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" type="button" onClick={() => setConfirming(null)}>{t("common.cancel")}</button>
            <button className="primary-button" disabled={confirm.isPending} type="button" onClick={() => confirming && confirm.mutate(confirming)}>
              {confirm.isPending ? t("emailCenter.confirmingReply") : t("common.confirm")}
            </button>
          </div>
        )}
      >
        {t("emailCenter.confirmReplyWarning")}
      </Dialog>
    </section>
  );
}

function replyIntentLabel(intent: QuoteReplyAssessment["intent"], t: ReturnType<typeof useI18n>["t"]) {
  const key = intent === "ACCEPT"
    ? "emailCenter.replyIntentAccept"
    : intent === "REJECT"
      ? "emailCenter.replyIntentReject"
      : intent === "NEGOTIATE"
        ? "emailCenter.replyIntentNegotiate"
        : intent === "QUESTION"
          ? "emailCenter.replyIntentQuestion"
          : "emailCenter.replyIntentUncertain";
  return t(key);
}
