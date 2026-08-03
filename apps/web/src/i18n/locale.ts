import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@oem-crm/shared";

export const LOCALE_STORAGE_KEY = "preferredLocale";

export const LOCALE_OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: "zh-CN", label: "中文" },
  { value: "en-US", label: "English" },
  { value: "es-ES", label: "Espanol" }
];

export function readInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored) return normalizeLocale(stored);

  return normalizeLocale(window.navigator.language);
}

export function readCurrentLocale(): Locale {
  return readInitialLocale();
}

export function persistLocale(locale: Locale) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
