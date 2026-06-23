import { FileUpload } from "../../components/FileUpload";
import { splitList } from "../../shared/utils/string";

export type SpecPair = {
  key: string;
  value: string;
};

export type Field = {
  key: string;
  label: string;
  type?: "textarea" | "number" | "date" | "file";
  required?: boolean;
  placeholder?: string;
  multiple?: boolean;
};

export function KnowledgeForm(props: {
  fields: Field[];
  values: Record<string, string>;
  submitLabel: string;
  busy: boolean;
  onChange: (values: Record<string, string>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  uploadEntityType?: string;
  editingId?: string;
  specDraft: SpecPair;
  specPairs: SpecPair[];
  onSpecDraftChange: (value: SpecPair) => void;
  onAddSpec: () => void;
  onRemoveSpec: (key: string) => void;
}) {
  return (
    <div className="form-grid">
      {props.fields.map((field) => {
        const wrapperClassName = field.type === "textarea" || field.type === "file" ? "wide-field" : "";
        const content = field.key === "specifications" ? (
          <SpecificationEditor
            draft={props.specDraft}
            pairs={props.specPairs}
            onDraftChange={props.onSpecDraftChange}
            onAdd={props.onAddSpec}
            onRemove={props.onRemoveSpec}
          />
        ) : field.type === "textarea" ? (
          <textarea
            value={props.values[field.key] ?? ""}
            placeholder={field.placeholder}
            onChange={(event) => props.onChange({ ...props.values, [field.key]: event.target.value })}
          />
        ) : field.type === "file" ? (
          <FileUpload
            fileIds={splitList(props.values[field.key] ?? "")}
            onChange={(ids) => props.onChange({ ...props.values, [field.key]: ids.join(",") })}
            entityType={props.uploadEntityType ?? "misc"}
            entityId={props.editingId}
            multiple={field.multiple}
          />
        ) : (
          <input
            type={field.type ?? "text"}
            value={props.values[field.key] ?? ""}
            placeholder={field.placeholder}
            onChange={(event) => props.onChange({ ...props.values, [field.key]: event.target.value })}
          />
        );

        if (field.type === "file") {
          return (
            <div className={wrapperClassName} key={field.key}>
              <span>{field.label}{field.required ? " *" : ""}</span>
              {content}
            </div>
          );
        }

        return (
          <label className={wrapperClassName} key={field.key}>
            <span>{field.label}{field.required ? " *" : ""}</span>
            {content}
          </label>
        );
      })}
      <div className="wide-field toolbar">
        <button className="primary-button" disabled={props.busy} onClick={props.onSubmit}>
          {props.busy ? "处理中..." : props.submitLabel}
        </button>
        {props.onCancel ? <button className="secondary-button" onClick={props.onCancel}>取消编辑</button> : null}
      </div>
    </div>
  );
}

function SpecificationEditor(props: {
  draft: SpecPair;
  pairs: SpecPair[];
  onDraftChange: (value: SpecPair) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="spec-editor">
      <div className="spec-entry-fields">
        <input
          placeholder="如：尺寸"
          value={props.draft.key}
          onChange={(event) => props.onDraftChange({ ...props.draft, key: event.target.value })}
        />
        <input
          placeholder="如：10x10cm"
          value={props.draft.value}
          onChange={(event) => props.onDraftChange({ ...props.draft, value: event.target.value })}
        />
        <button className="secondary-button" onClick={props.onAdd} type="button">添加参数</button>
      </div>

      {props.pairs.length ? (
        <div className="spec-entry-list">
          {props.pairs.map((pair) => (
            <div className="spec-entry-row" key={pair.key}>
              <div className="spec-entry-pair">
                <strong>{pair.key}</strong>
                <span>{pair.value}</span>
              </div>
              <button className="secondary-button" onClick={() => props.onRemove(pair.key)} type="button">删除</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">暂未添加规格参数。</div>
      )}
    </div>
  );
}
