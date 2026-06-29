import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EMAIL_DRAFT_PURPOSES, EmailDraftStatus, emailDraftPurposeLabel } from "@oem-crm/shared";
import { getCustomerEmailDrafts } from "../../../../../api/customers";
import { AppSelect } from "../../../../../components/AppSelect";
import type { EmailDraftListItem, EmailDraftPage } from "../../shared/types";
import { EmailDraftCard } from "./EmailDraftCard";
import {
  buildEmailDraftFilterQuery,
  flattenEmailDraftPages,
  shouldPollEmailDraftPages,
  type EmailDraftFilters
} from "./email-draft-history-state";

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: EmailDraftStatus.Draft, label: "草稿" },
  { value: EmailDraftStatus.PendingReview, label: "待审核" },
  { value: EmailDraftStatus.Approved, label: "已审核" },
  { value: EmailDraftStatus.Rejected, label: "已驳回" },
  { value: EmailDraftStatus.Sent, label: "已发送" }
];

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
  const [expanded, setExpanded] = useState(false);
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
        <button className="email-draft-history-toggle" type="button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <h2>邮件</h2>
        </button>
        <span>{expanded ? `${drafts.length} 封已加载` : null}</span>
      </div>

      {expanded ? (
        <div className="email-draft-history-window">
          <div className="email-draft-filter-bar">
            <label>
              <span>邮件类型</span>
              <AppSelect
                variant="toolbar"
                value={filters.purpose}
                onChange={(purpose) => setFilters((current) => ({ ...current, purpose }))}
                options={[
                  { value: "", label: "全部类型" },
                  ...EMAIL_DRAFT_PURPOSES.map((purpose) => ({ value: purpose, label: emailDraftPurposeLabel(purpose) }))
                ]}
              />
            </label>
            <label>
              <span>邮件状态</span>
              <AppSelect
                variant="toolbar"
                value={filters.status}
                onChange={(status) => setFilters((current) => ({ ...current, status }))}
                options={STATUS_OPTIONS}
              />
            </label>
            <label>
              <span>收件人</span>
              <input
                value={filters.recipient}
                placeholder="姓名或邮箱"
                onChange={(event) => setFilters((current) => ({ ...current, recipient: event.target.value }))}
              />
            </label>
          </div>

          {query.isLoading ? <div className="loading-state">邮件草稿加载中...</div> : null}
          {query.isError ? <div className="empty-state">邮件草稿加载失败，请稍后重试。</div> : null}
          {!query.isLoading && !query.isError && !drafts.length ? <div className="empty-state">当前筛选条件下暂无邮件草稿。</div> : null}
          {drafts.length ? (
            <div className="email-draft-list">
              {drafts.map((draft) => (
                <EmailDraftCard customerId={customerId} draft={draft} onChanged={onChanged} key={draft.id} />
              ))}
              <div className="email-draft-load-sentinel" ref={loadMoreRef}>
                {query.isFetchingNextPage ? "加载更多邮件..." : query.hasNextPage ? "继续向下滚动加载更多" : "已加载当前筛选下的全部草稿"}
              </div>
            </div>
          ) : null}
        </div>
      ) : (null
      )}
    </section>
  );
}
