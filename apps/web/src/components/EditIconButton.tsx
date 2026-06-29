import editIconUrl from "./icons/编辑.svg";
import type { CSSProperties } from "react";

export function EditIconButton(props: {
  className?: string;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}) {
  const label = props.label ?? "编辑";
  return (
    <button
      aria-label={label}
      className={`${props.className ?? "secondary-button"} icon-button edit-icon-button`}
      disabled={props.disabled}
      onClick={props.onClick}
      title={label}
      type="button"
    >
      <span
        aria-hidden="true"
        className="edit-icon-glyph"
        style={{ "--edit-icon-url": `url("${editIconUrl}")` } as CSSProperties}
      />
    </button>
  );
}
