import trashIconUrl from "./icons/垃圾桶.svg";
import type { CSSProperties } from "react";

export function DeleteIconButton(props: {
  className?: string;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}) {
  const label = props.label ?? "删除";
  return (
    <button
      aria-label={label}
      className={`${props.className ?? "secondary-button"} icon-button delete-icon-button`}
      disabled={props.disabled}
      onClick={props.onClick}
      title={label}
      type="button"
    >
      <span
        aria-hidden="true"
        className="delete-icon-glyph"
        style={{ "--delete-icon-url": `url("${trashIconUrl}")` } as CSSProperties}
      />
    </button>
  );
}
