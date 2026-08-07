import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@oem-crm/shared";
import { LOCALE_OPTIONS, persistLocale, readInitialLocale } from "./locale";
import { resources, type TranslationKey } from "./resources";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: string) => void;
  options: typeof LOCALE_OPTIONS;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readInitialLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: string) => {
    const normalized = normalizeLocale(nextLocale);
    setLocaleState(normalized);
    persistLocale(normalized);
  }, []);

  const t = useCallback((key: TranslationKey) => translate(locale, key), [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    options: LOCALE_OPTIONS,
    t
  }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}

export function translate(locale: Locale, key: TranslationKey) {
  const value = readResourceValue(resources[locale], key);
  if (typeof value === "string") return value;

  const fallback = readResourceValue(resources[DEFAULT_LOCALE], key);
  return typeof fallback === "string" ? fallback : key;
}

function readResourceValue(source: unknown, key: string) {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}
