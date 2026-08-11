import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EMAIL_DRAFT_PURPOSES, EmailDraftStatus, emailDraftPurposeLabel, emailDraftStatusLabel } from "@oem-crm/shared";
import { getCustomerEmailDrafts } from "../../../../../api/customers";
import { AppSelect } from "../../../../../components/AppSelect";
import { useI18n } from "../../../../../i18n";
import type { EmailDraftListItem, EmailDraftPage } from "../../shared/types";
import { EmailDraftCard } from "./EmailDraftCard";
import {
  buildEmailDraftFilterQuery,
  flattenEmailDraftPages,
  shouldPollEmailDraftPages,
  type EmailDraftFilters
} from "./email-draft-history-state";

const DEFAULT_FILTERS: EmailDraftFilters = {
  purpose: "",
  status: "",
  recipient: ""
};

export function EmailDraftHistory({
  customerId,
  onChanged
}: {
  customerId: string;
  onChanged: () => void;
}) {
  const { locale, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EmailDraftFilters>(DEFAULT_FILTERS);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["email-drafts", customerId, filters],
    enabled: expanded,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getCustomerEmailDrafts<EmailDraftPage>(customerId, buildEmailDraftFilterQuery(filters, pageParam)),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: (result) => (shouldPollEmailDraftPages(result.state.data?.pages) ? 3000 : false)
  });
  const drafts = useMemo(() => flattenEmailDraftPages<EmailDraftListItem>(query.data?.pages), [query.data?.pages]);

  function toggleHistory() {
    if (expanded) setExpandedDraftId(null);
    setExpanded(!expanded);
  }

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !expanded) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        query.fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  return (
    <section className={`table-panel email-draft-history ${expanded ? "is-expanded" : ""}`}>
      <div className="panel-title">
        <button className="email-draft-history-toggle" type="button" onClick={toggleHistory}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <h2>{t("emailCenter.emailTitle")}</h2>
        </button>
        <span>{expanded ? `${drafts.length} ${t("emailCenter.loadedDraftsSuffix")}` : null}</span>
      </div>

      {expanded ? (
        <div className="email-draft-history-window">
          <div className="email-draft-filter-bar">
            <label>
              <span>{t("emailCenter.draftPurpose")}</span>
              <AppSelect
                variant="toolbar"
                value={filters.purpose}
                onChange={(purpose) => setFilters((current) => ({ ...current, purpose }))}
                options={[
                  { value: "", label: t("common.allTypes") },
                  ...EMAIL_DRAFT_PURPOSES.map((purpose) => ({ value: purpose, label: emailDraftPurposeLabel(purpose, locale) }))
                ]}
              />
            </label>
            <label>
              <span>{t("common.status")}</span>
              <AppSelect
                variant="toolbar"
                value={filters.status}
                onChange={(status) => setFilters((current) => ({ ...current, status }))}
                options={[
                  { value: "", label: t("emailCenter.allStatuses") },
                  ...Object.values(EmailDraftStatus).map((status) => ({ value: status, label: emailDraftStatusLabel(status, locale) }))
                ]}
              />
            </label>
            <label>
              <span>{t("emailCenter.recipient")}</span>
              <input
                value={filters.recipient}
                placeholder={t("emailCenter.recipientPlaceholder")}
                onChange={(event) => setFilters((current) => ({ ...current, recipient: event.target.value }))}
              />
            </label>
          </div>

          {query.isLoading ? <div className="loading-state">{t("emailCenter.loadingDrafts")}</div> : null}
          {query.isError ? <div className="empty-state">{t("emailCenter.loadDraftsError")}</div> : null}
          {!query.isLoading && !query.isError && !drafts.length ? <div className="empty-state">{t("emailCenter.emptyFilteredDrafts")}</div> : null}
          {drafts.length ? (
            <div className="email-draft-list">
              {drafts.map((draft) => (
                <EmailDraftCard
                  customerId={customerId}
                  draft={draft}
                  expanded={expandedDraftId === draft.id}
                  key={draft.id}
                  onChanged={onChanged}
                  onToggle={() => setExpandedDraftId((current) => current === draft.id ? null : draft.id)}
                />
              ))}
              <div className="email-draft-load-sentinel" ref={loadMoreRef}>
                {query.isFetchingNextPage ? t("emailCenter.loadMoreDrafts") : query.hasNextPage ? t("emailCenter.scrollMoreDrafts") : t("emailCenter.allDraftsLoaded")}
              </div>
            </div>
          ) : null}
        </div>
      ) : (null
      )}
    </section>
  );
}
