import type { TranslationKey } from "./resources";

const DEFAULT_CUSTOMER_TYPE_KEYS = {
  "品牌商": "customerTypes.brandOwner",
  "最终客户": "customerTypes.endCustomer",
  "代理商": "customerTypes.agent",
  "批发商": "customerTypes.wholesaler",
  "分销商": "customerTypes.distributor",
  "零售商": "customerTypes.retailer",
  "跨境电商": "customerTypes.crossBorderEcommerce",
  "采购商": "customerTypes.procurementBuyer",
  "OEM/ODM Target": "customerTypes.oemOdmTarget"
} as const satisfies Record<string, TranslationKey>;

export function customerTypeLabel(name: string, t: (key: TranslationKey) => string) {
  const key = DEFAULT_CUSTOMER_TYPE_KEYS[name as keyof typeof DEFAULT_CUSTOMER_TYPE_KEYS];
  return key ? t(key) : name;
}
