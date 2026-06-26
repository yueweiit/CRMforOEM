import plusIconUrl from "./icons/加号.svg";

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
      <img alt="" aria-hidden="true" src={plusIconUrl} />
    </button>
  );
}
