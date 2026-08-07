import type { TranslationKey } from "./resources";

const DEFAULT_CUSTOMER_SOURCE_KEYS = {
  "手动录入": "customerSources.manualEntry",
  "线下": "customerSources.offline",
  "Google搜索": "customerSources.googleSearch",
  LinkedIn: "customerSources.linkedIn",
  "展会": "customerSources.tradeShow",
  "阿里国际站": "customerSources.alibabaInternational",
  "老客推荐": "customerSources.customerReferral",
  "行业名录": "customerSources.industryDirectory"
} as const satisfies Record<string, TranslationKey>;

export function customerSourceLabel(name: string, t: (key: TranslationKey) => string) {
  const key = DEFAULT_CUSTOMER_SOURCE_KEYS[name as keyof typeof DEFAULT_CUSTOMER_SOURCE_KEYS];
  return key ? t(key) : name;
}
