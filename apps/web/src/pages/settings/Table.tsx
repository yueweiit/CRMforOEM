import type { ReactNode } from "react";
import { EmptyState } from "../../components/ui/EmptyState";

export function Table(props: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  if (!props.rows.length) return <EmptyState message="暂无数据。" />;
  return <table><thead><tr>{props.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{props.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>;
}
