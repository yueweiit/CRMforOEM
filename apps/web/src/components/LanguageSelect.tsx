import { AppSelect } from "./AppSelect";
import { useI18n } from "../i18n";

type LanguageSelectProps = {
  className?: string;
  variant?: "form" | "filter" | "toolbar";
};

export function LanguageSelect({ className, variant = "toolbar" }: LanguageSelectProps) {
  const { locale, setLocale, options, t } = useI18n();

  return (
    <div className={["language-select", className].filter(Boolean).join(" ")}>
      <span>{t("common.language")}</span>
      <AppSelect value={locale} onChange={setLocale} options={options} variant={variant} title={t("common.language")} />
    </div>
  );
}
