export const RESEARCH_REPORT_QUEUE = "research-report";

export const RESEARCH_PROMPT_MAX_CHARS = 12_000;

export const RESEARCH_PROMPT_BUDGETS = [
  {
    contacts: 8, searchResults: 5, products: 12, capabilities: 8, caseStudies: 6,
    productCategories: 12, pages: 12, genericListItems: 8,
    salesNotesChars: 1200, insightChars: 500, pageTextChars: 500,
    searchTitleChars: 160, searchSnippetChars: 260,
    productDescriptionChars: 260, capabilityDescriptionChars: 260, caseStudySummaryChars: 300
  },
  {
    contacts: 5, searchResults: 3, products: 8, capabilities: 5, caseStudies: 4,
    productCategories: 8, pages: 8, genericListItems: 5,
    salesNotesChars: 700, insightChars: 300, pageTextChars: 260,
    searchTitleChars: 120, searchSnippetChars: 180,
    productDescriptionChars: 180, capabilityDescriptionChars: 180, caseStudySummaryChars: 200
  },
  {
    contacts: 3, searchResults: 2, products: 5, capabilities: 3, caseStudies: 2,
    productCategories: 5, pages: 5, genericListItems: 3,
    salesNotesChars: 400, insightChars: 180, pageTextChars: 160,
    searchTitleChars: 90, searchSnippetChars: 120,
    productDescriptionChars: 120, capabilityDescriptionChars: 120, caseStudySummaryChars: 140
  }
] as const;

export type ResearchPromptBudget = typeof RESEARCH_PROMPT_BUDGETS[number];
