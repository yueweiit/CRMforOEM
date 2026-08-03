import { EmptyState } from "../../components/ui/EmptyState";
import { DeleteIconButton } from "../../components/DeleteIconButton";
import { EditIconButton } from "../../components/EditIconButton";
import { useI18n } from "../../i18n";
import type { Field } from "./KnowledgeForm";

export type KnowledgeRecord = Record<string, unknown> & {
  id: string;
  name?: string;
  title?: string;
  category?: string;
  updatedAt?: string;
};

export function KnowledgeTable(props: {
  rows: KnowledgeRecord[];
  fields: Field[];
  onEdit: (row: KnowledgeRecord) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!props.rows.length) return <EmptyState message={t("knowledge.empty")} />;
  const visibleFields = props.fields.filter((field) => field.type !== "file").slice(0, 4);
  return (
    <table>
      <thead>
        <tr>
          {visibleFields.map((field) => <th key={field.key}>{field.label}</th>)}
          <th>{t("common.updatedAt")}</th>
          <th>{t("common.operation")}</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.id}>
            {visibleFields.map((field) => <td key={field.key}>{formatValue(row[field.key])}</td>)}
            <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "-"}</td>
            <td>
              <div className="toolbar">
                <EditIconButton onClick={() => props.onEdit(row)} />
                <DeleteIconButton onClick={() => props.onDelete(row.id)} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}
