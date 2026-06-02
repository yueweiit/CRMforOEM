import { Switch as FusionSwitch } from "@alifd/next";
import "@alifd/next/lib/switch/style.js";

interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  autoWidth?: boolean;
  className?: string;
}

export function Switch({
  checked,
  defaultChecked,
  onChange,
  disabled,
  loading,
  autoWidth,
  className
}: SwitchProps) {
  return (
    <FusionSwitch
      checked={checked}
      defaultChecked={defaultChecked}
      onChange={(value) => onChange?.(value)}
      disabled={disabled || loading}
      autoWidth={autoWidth}
      className={className}
      size="small"
    />
  );
}
