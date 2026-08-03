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
  const { locale, t } = useI18n();
  return (
    <section className="table-panel">
      {isLoading ? <LoadingState message={t("customers.loadingList")} /> : null}
      {isError ? <ErrorState message={t("customers.listError")} /> : null}
      {!isLoading && !isError && !data.length ? <EmptyState message={t("customers.emptyList")} /> : null}
      {data.length ? (
        <table>
          <thead>
            <tr>
              <th>{t("customers.tableCustomer")}</th>
              <th>{t("customers.tableCountry")}</th>
              <th>{t("customers.tableStage")}</th>
              <th>{t("customers.tableScore")}</th>
              <th>{t("customers.tableContact")}</th>
              <th>{t("customers.tableOwner")}</th>
              <th>{t("customers.tableUpdatedAt")}</th>
              <th>{t("customers.tableAction")}</th>
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
                  <Link to={`/customers/${customer.id}/overview`} className="secondary-button icon-button edit-icon-button" aria-label={t("common.edit")} title={t("common.edit")}>
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
