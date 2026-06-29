import plusIconUrl from "./icons/加号.svg";
import type { CSSProperties } from "react";

export function AddIconButton(props: {
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}) {
  const label = props.label ?? "新增";
  return (
    <button
      aria-label={label}
      className="secondary-button icon-button add-icon-button"
      disabled={props.disabled}
      onClick={props.onClick}
      title={label}
      type="button"
    >
      <span
        aria-hidden="true"
        className="add-icon-glyph"
        style={{ "--add-icon-url": `url("${plusIconUrl}")` } as CSSProperties}
      />
    </button>
  );
}
