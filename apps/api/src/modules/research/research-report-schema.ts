export type ResearchSectionKey =
  | "company_basic_info"
  | "background_history"
  | "core_business_product_lines"
  | "market_competition"
  | "brand_marketing"
  | "price_positioning"
  | "website_product_analysis"
  | "summary_development_recommendations";

export type ResearchFieldSpec = {
  key: string;
  label: string;
  kind: "text" | "list";
};

export const RESEARCH_SECTION_ORDER: ResearchSectionKey[] = [
  "company_basic_info",
  "background_history",
  "core_business_product_lines",
  "market_competition",
  "brand_marketing",
  "price_positioning",
  "website_product_analysis",
  "summary_development_recommendations"
];

export const RESEARCH_SECTION_LABELS: Record<ResearchSectionKey, string> = {
  company_basic_info: "一、公司基本信息",
  background_history: "二、企业背景和发展历程",
  core_business_product_lines: "三、核心业务与产品线",
  market_competition: "四、市场表现与竞争格局",
  brand_marketing: "五、品牌策略与营销方式",
  price_positioning: "六、产品价格定位",
  website_product_analysis: "七、官网产品专项分析",
  summary_development_recommendations: "八、总结与开发建议"
};

export const RESEARCH_STRUCTURED_SECTION_SCHEMA: Record<Exclude<ResearchSectionKey, "summary_development_recommendations">, ResearchFieldSpec[]> = {
  company_basic_info: [
    { key: "company_name", label: "公司名称", kind: "text" },
    { key: "country", label: "所属国家", kind: "text" },
    { key: "website", label: "官网", kind: "text" },
    { key: "company_type", label: "企业类型", kind: "text" },
    { key: "main_business", label: "主营业务", kind: "text" },
    { key: "sales_markets", label: "销售市场", kind: "list" },
    { key: "contacts", label: "联系方式", kind: "list" },
    { key: "social_media_accounts", label: "社交媒体账号", kind: "list" }
  ],
  background_history: [
    { key: "founded_year", label: "成立时间", kind: "text" },
    { key: "development_milestones", label: "发展节点", kind: "list" },
    { key: "brand_evolution", label: "品牌迭代情况", kind: "text" },
    { key: "operating_scale", label: "经营规模", kind: "text" },
    { key: "market_coverage", label: "市场覆盖范围", kind: "list" }
  ],
  core_business_product_lines: [
    { key: "main_products", label: "主营产品", kind: "list" },
    { key: "product_categories", label: "产品分类", kind: "list" },
    { key: "hot_products", label: "爆款产品", kind: "list" },
    { key: "core_selling_points", label: "产品核心卖点", kind: "list" },
    { key: "oem_odm_fit", label: "OEM/ODM合作适配性判断", kind: "text" }
  ],
  market_competition: [
    { key: "main_sales_markets", label: "主营销售市场", kind: "list" },
    { key: "benchmark_competitors", label: "对标竞争品牌", kind: "list" },
    { key: "channel_types", label: "销售渠道类型", kind: "list" },
    { key: "market_positioning", label: "市场定位", kind: "text" },
    { key: "supply_chain_needs", label: "供应链采购需求", kind: "list" }
  ],
  brand_marketing: [
    { key: "brand_tier", label: "品牌档次定位", kind: "text" },
    { key: "website_visual_style", label: "官网视觉风格", kind: "text" },
    { key: "marketing_messages", label: "营销话术", kind: "list" },
    { key: "target_audience", label: "目标客群", kind: "list" },
    { key: "social_media_activity", label: "社媒活跃度", kind: "text" },
    { key: "promotion_direction", label: "品牌推广方向", kind: "text" }
  ],
  price_positioning: [
    { key: "price_range", label: "产品价格区间", kind: "text" },
    { key: "tier_judgement", label: "高端/中端/平价档次判定", kind: "text" },
    { key: "quality_price_match", label: "品质与价格匹配度", kind: "text" },
    { key: "suitable_supply_grade", label: "适配供货产品等级", kind: "text" }
  ],
  website_product_analysis: [
    { key: "product_categories", label: "产品分类", kind: "list" },
    { key: "product_count", label: "产品数量", kind: "text" },
    { key: "image_style", label: "图片风格", kind: "text" },
    { key: "selling_point_descriptions", label: "卖点描述", kind: "list" },
    { key: "hot_products", label: "热销款", kind: "list" },
    { key: "missing_product_lines", label: "缺失产品线", kind: "list" },
    { key: "cooperation_entry_opportunities", label: "合作切入机会", kind: "list" }
  ]
};

export const RESEARCH_RECOMMENDATION_FIELDS: ResearchFieldSpec[] = [
  { key: "customer_value_rating", label: "客户开发价值评级", kind: "text" },
  { key: "development_priority", label: "开发优先级", kind: "text" },
  { key: "recommended_products", label: "推荐供货产品", kind: "list" },
  { key: "email_entry_points", label: "邮件开发切入点", kind: "list" },
  { key: "cooperation_opportunities", label: "合作机会", kind: "list" },
  { key: "potential_risks", label: "潜在合作风险", kind: "list" },
  { key: "next_actions", label: "下一步行动", kind: "list" }
];

export function buildResearchJsonSchemaPrompt() {
  const sectionLines = Object.entries(RESEARCH_STRUCTURED_SECTION_SCHEMA).map(([sectionKey, fields]) => {
    const fieldLines = fields.map((field) => {
      const emptyValue = field.kind === "list" ? "[]" : "\"\"";
      return `      "${field.key}": ${emptyValue}`;
    });
    return `    "${sectionKey}": {\n${fieldLines.join(",\n")},\n      "confirmed_facts": [],\n      "analysis": "",\n      "missing_info": []\n    }`;
  });

  const recommendationLines = RESEARCH_RECOMMENDATION_FIELDS.map((field) => {
    const emptyValue = field.kind === "list" ? "[]" : "\"\"";
    return `      "${field.key}": ${emptyValue}`;
  });

  return `{
  "title": "string",
  "sections": {
${sectionLines.join(",\n")},
    "summary_development_recommendations": {
${recommendationLines.join(",\n")}
    }
  },
  "source_basis": [{"section": "section_key", "source": "source_type", "evidence": "specific evidence"}],
  "markdown_report": "Chinese Markdown report"
}`;
}
