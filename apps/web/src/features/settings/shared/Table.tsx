import type { ReactNode } from "react";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useI18n } from "../../../i18n";

export function Table(props: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  const { t } = useI18n();
  if (!props.rows.length) return <EmptyState message={t("common.noData")} />;
  return <table><thead><tr>{props.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{props.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>;
}
