import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { EMAIL_DRAFT_PURPOSES, emailDraftPurposeLabel } from "@oem-crm/shared";
import { getEmailAccounts } from "../../../../../api/email";
import { generateEmailDraft, getQuotes } from "../../../../../api/customers";
import { AppSelect } from "../../../../../components/AppSelect";
import { Switch } from "../../../../../components/Switch";
import { showClientToast } from "../../../../../components/Toast";
import { useI18n } from "../../../../../i18n";
import { sameEmailAddress } from "../../../../../shared/utils/email-format";
import type { AcceptedResponse, Contact, EmailAccount, Quote } from "../../shared/types";
import { cleanPayload, invalidateEmailData } from "./email-panel-utils";

type DraftForm = {
  purpose: string;
  toEmail: string;
  emailAccountId: string;
  userInstructions: string;
  quoteId: string;
  useHistoricalQuoteReferences: boolean;
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
  const [searchParams] = useSearchParams();
  const requestedQuoteId = searchParams.get("quoteId") ?? "";
  const { locale, t } = useI18n();
  const contactOptions = contacts.filter((contact) => Boolean(contact.email));
  const [draftForm, setDraftForm] = useState<DraftForm>({
    purpose: requestedQuoteId ? "QUOTATION" : "FIRST_OUTREACH",
    toEmail: contactOptions[0]?.email ?? "",
    emailAccountId: "",
    userInstructions: "",
    quoteId: requestedQuoteId,
    useHistoricalQuoteReferences: false
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: () => getEmailAccounts<EmailAccount[]>()
  });
  const selectableAccounts = accounts.filter((account) => !sameEmailAddress(account.email, draftForm.toEmail));
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes", customerId],
    queryFn: () => getQuotes<Quote[]>(customerId)
  });
  const quotationOptions = quotes.filter(
    (quote) => quote.approvalStatus === "APPROVED" && (quote.status === "DRAFT" || quote.status === "SENT")
  );

  useEffect(() => {
    if (requestedQuoteId && quotationOptions.some((quote) => quote.id === requestedQuoteId)) {
      setDraftForm((current) => ({ ...current, purpose: "QUOTATION", quoteId: requestedQuoteId }));
    }
  }, [requestedQuoteId, quotationOptions.length]);

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
          title: t("emailCenter.draftGeneratingTitle"),
          message: t("emailCenter.draftGeneratingMessage")
        });
      }
      invalidateEmailData(queryClient, customerId, onChanged);
      queryClient.invalidateQueries({ queryKey: ["customer-background-tasks", customerId] });
    }
  });

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{t("emailCenter.aiGenerateTitle")}</h2>
        <span>{t("emailCenter.aiGenerateHint")}</span>
      </div>
      <div className="form-grid">
        <label>
          <span>{t("emailCenter.draftPurpose")}</span>
          <AppSelect
            value={draftForm.purpose}
            onChange={(purpose) => setDraftForm({
              ...draftForm,
              purpose,
              quoteId: purpose === "QUOTATION" ? draftForm.quoteId : "",
              useHistoricalQuoteReferences: purpose === "QUOTATION" && draftForm.useHistoricalQuoteReferences
            })}
            options={EMAIL_DRAFT_PURPOSES.map((purpose) => ({ value: purpose, label: emailDraftPurposeLabel(purpose, locale) }))}
          />
        </label>
        {draftForm.purpose === "QUOTATION" ? (
          <>
            <label>
              <span>{t("emailCenter.linkedQuote")}</span>
              <AppSelect
                value={draftForm.quoteId}
                onChange={(quoteId) => setDraftForm({ ...draftForm, quoteId })}
                options={[
                  { value: "", label: t("emailCenter.selectApprovedQuote") },
                  ...quotationOptions.map((quote) => ({
                    value: quote.id,
                    label: `${quote.quoteNo} · ${quote.productName} · ${quote.currency} ${quote.amount}`
                  }))
                ]}
              />
            </label>
            <label className="quote-reference-toggle">
              <span>{t("emailCenter.historicalQuoteReference")}</span>
              <div>
                <Switch
                  checked={draftForm.useHistoricalQuoteReferences}
                  onChange={(useHistoricalQuoteReferences) => setDraftForm({ ...draftForm, useHistoricalQuoteReferences })}
                />
                <small>{t("emailCenter.historicalQuoteReferenceHint")}</small>
              </div>
            </label>
          </>
        ) : null}
        <label>
          <span>{t("emailCenter.recipient")}</span>
          <AppSelect
            value={draftForm.toEmail}
            onChange={(toEmail) => setDraftForm({ ...draftForm, toEmail })}
            options={[
              { value: "", label: t("emailCenter.selectContactEmail") },
              ...contactOptions.map((contact) => ({
                value: contact.email ?? "",
                label: `${contact.name || contact.email} · ${contact.email}`
              }))
            ]}
          />
        </label>
        <label>
          <span>{t("emailCenter.senderAccount")}</span>
          <AppSelect
            value={draftForm.emailAccountId}
            onChange={(emailAccountId) => setDraftForm({ ...draftForm, emailAccountId })}
            options={[
              { value: "", label: t("emailCenter.autoSelectSender") },
              ...selectableAccounts.map((account) => ({
                value: account.id,
                label: `${account.name} · ${account.email} ${account.scope === "SHARED" ? `(${t("emailCenter.sharedSuffix")})` : ""}`
              }))
            ]}
          />
        </label>
        <label className="wide-field">
          <span>{t("emailCenter.additionalRequirements")}</span>
          <textarea
            value={draftForm.userInstructions}
            onChange={(event) => setDraftForm({ ...draftForm, userInstructions: event.target.value })}
          />
        </label>
        <div className="wide-field">
          <button
            className="primary-button"
            disabled={!draftForm.toEmail || !selectableAccounts.length || generate.isPending || (draftForm.purpose === "QUOTATION" && !draftForm.quoteId)}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? t("emailCenter.generating") : t("emailCenter.generateAiDraft")}
          </button>
        </div>
        {!selectableAccounts.length && draftForm.toEmail ? (
          <div className="wide-field empty-state">
            {t("emailCenter.noAvailableSender")}
          </div>
        ) : null}
      </div>
    </section>
  );
}
