import type { Locale } from "@oem-crm/shared";
import { enUS } from "./en-US";
import { esES } from "./es-ES";
import { zhCN } from "./zh-CN";

export const resources = {
  "zh-CN": zhCN,
  "en-US": enUS,
  "es-ES": esES
} satisfies Record<Locale, WidenStrings<typeof zhCN>>;

export type TranslationKey = DotPath<typeof zhCN>;

type WidenStrings<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends Record<string, unknown> ? WidenStrings<T[K]> : T[K];
};

type DotPath<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown> ? `${K}.${DotPath<T[K]>}` : K;
}[keyof T & string];
