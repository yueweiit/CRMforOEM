import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { stageLabel } from "@oem-crm/shared";
import editIconUrl from "../../../components/icons/编辑.svg";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { LoadingState } from "../../../components/ui/LoadingState";
import { useI18n } from "../../../i18n";

export type Customer = {
  id: string;
  name: string;
  websiteUrl?: string;
  websiteDomain?: string;
  country?: string;
  stage: string;
  owner?: { name: string };
  contacts?: Array<{ email?: string; name?: string }>;
  oemFitScores?: Array<{ score: number; grade: string }>;
  updatedAt: string;
};

export function CustomerListTable({
  data,
  isLoading,
  isError
}: {
  data: Customer[];
  isLoading: boolean;
  isError: boolean;
}) {
  const { locale } = useI18n();
  return (
    <section className="table-panel">
      {isLoading ? <LoadingState message="正在加载客户..." /> : null}
      {isError ? <ErrorState message="客户列表加载失败，请重新登录或稍后刷新。" /> : null}
      {!isLoading && !isError && !data.length ? <EmptyState message="暂无客户，请先新增目标客户。" /> : null}
      {data.length ? (
        <table>
          <thead>
            <tr>
              <th>客户</th>
              <th>国家</th>
              <th>阶段</th>
              <th>评分</th>
              <th>联系人</th>
              <th>负责人</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <Link to={`/customers/${customer.id}/overview`} className="table-link">
                    {customer.name}
                  </Link>
                  <small>{customer.websiteDomain ?? customer.websiteUrl ?? "-"}</small>
                </td>
                <td>{customer.country ?? "-"}</td>
                <td><span className="status-pill">{stageLabel(customer.stage, locale)}</span></td>
                <td>{customer.oemFitScores?.[0] ? `${customer.oemFitScores[0].score} / ${customer.oemFitScores[0].grade}` : "-"}</td>
                <td>{customer.contacts?.[0]?.email ?? customer.contacts?.[0]?.name ?? "-"}</td>
                <td>{customer.owner?.name ?? "-"}</td>
                <td>{new Date(customer.updatedAt).toLocaleDateString()}</td>
                <td>
                  <Link to={`/customers/${customer.id}/overview`} className="secondary-button icon-button edit-icon-button" aria-label="编辑" title="编辑">
                    <span
                      aria-hidden="true"
                      className="edit-icon-glyph"
                      style={{ "--edit-icon-url": `url("${editIconUrl}")` } as CSSProperties}
                    />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
