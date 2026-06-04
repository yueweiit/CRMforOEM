import { Select } from "@alifd/next";
import "@alifd/next/lib/select/style.js";

export type AppSelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type AppSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  className?: string;
  variant?: "form" | "filter" | "toolbar";
  disabled?: boolean;
  title?: string;
};

export function AppSelect({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  variant = "form",
  disabled,
  title
}: AppSelectProps) {
  return (
    <Select
      className={["app-select", `app-select--${variant}`, className].filter(Boolean).join(" ")}
      value={value}
      onChange={(nextValue) => onChange(String(nextValue ?? ""))}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      autoWidth={false}
    >
      {options.map((option) => (
        <Select.Option value={option.value} disabled={option.disabled} key={option.value}>
          {option.label}
        </Select.Option>
      ))}
    </Select>
  );
}
