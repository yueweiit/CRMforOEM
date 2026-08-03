export const SUPPORTED_LOCALES = ["zh-CN", "en-US", "es-ES"] as const;

export type Locale = typeof SUPPORTED_LOCALES[number];

export const DEFAULT_LOCALE: Locale = "zh-CN";

export function normalizeLocale(value?: string | null): Locale {
  const normalized = value?.trim();
  if (!normalized) return DEFAULT_LOCALE;

  if (normalized === "zh-CN" || normalized === "zh" || normalized.toLowerCase().startsWith("zh-")) {
    return "zh-CN";
  }

  if (normalized === "en-US" || normalized === "en" || normalized.toLowerCase().startsWith("en-")) {
    return "en-US";
  }

  if (normalized === "es-ES" || normalized === "es" || normalized.toLowerCase().startsWith("es-")) {
    return "es-ES";
  }

  return DEFAULT_LOCALE;
}
