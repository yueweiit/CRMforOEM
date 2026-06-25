import type {
  EvidenceGroupName,
  EvidenceGroupAssignment,
  WebsiteEvidenceGroup,
  WebsiteEvidenceItem
} from "../website-analysis.types";
import type { WebsiteAnalysisResult } from "@oem-crm/shared";
import { buildSourceIndex } from "./website-evidence-inventory.builder";

// ── Scoring helpers ──

type GroupScore = { group: EvidenceGroupName; score: number; reasons: string[] };

function addScore(map: Map<EvidenceGroupName, GroupScore>, group: EvidenceGroupName, score: number, reason: string) {
  const existing = map.get(group);
  if (existing) {
    existing.score += score;
    existing.reasons.push(reason);
  } else {
    map.set(group, { group, score, reasons: [reason] });
  }
}

function addPageTypeScore(scores: Map<EvidenceGroupName, GroupScore>, item: WebsiteEvidenceItem) {
  if (item.kind !== "PAGE") return;
  const map: Record<string, [EvidenceGroupName, number, string]> = {
    HOME: ["brand_about", 80, "首页通常包含品牌定位和主营业务"],
    ABOUT: ["brand_about", 90, "关于页属于公司背景证据"],
    PRODUCT_LIST: ["product_catalog", 90, "产品列表页属于产品结构证据"],
    PRODUCT_DETAIL: ["product_catalog", 95, "产品详情页属于核心产品证据"],
    CONTACT: ["contact_channel", 95, "联系页属于联系方式证据"],
    BRAND: ["brand_about", 85, "品牌页属于品牌定位证据"],
    SUPPORT: ["risk_signal", 35, "支持页置信度较低"],
    OTHER: ["uncertain", 20, "无法从页面类型判断分组"]
  };
  const entry = map[item.pageType];
  if (entry) {
    addScore(scores, entry[0], item.httpStatus && item.httpStatus >= 400 ? entry[1] * 0.3 : entry[1], entry[2]);
  }
}

function addUrlPathScore(scores: Map<EvidenceGroupName, GroupScore>, item: WebsiteEvidenceItem) {
  if (item.kind !== "PAGE") return;
  let path: string;
  try {
    path = new URL(item.url).pathname.toLowerCase();
  } catch {
    return;
  }

  if (/product|produto|catalog|shop|store|collection|category/i.test(path)) {
    addScore(scores, "product_catalog", 30, "URL 包含产品或目录信号");
  }
  if (/contact|support|help/i.test(path)) {
    addScore(scores, "contact_channel", 40, "URL 包含联系或支持信号");
  }
  if (/about|brand|company|our-story|who-we-are/i.test(path)) {
    addScore(scores, "brand_about", 35, "URL 包含公司或品牌信号");
  }
  if (/price|pricing|wholesale|trade|distributor/i.test(path)) {
    addScore(scores, "price_region", 50, "URL 包含价格或批发信号");
  }
  if (/oem|odm|private.label|custom.manufactur/i.test(path)) {
    addScore(scores, "oem_opportunity", 60, "URL 包含OEM/ODM合作信号");
  }
  if (/privacy|terms|faq|return|shipping|policy|legal/i.test(path)) {
    addScore(scores, "risk_signal", 15, "URL 属于低价值辅助页面");
  }
}

function addTitleHeadingScore(scores: Map<EvidenceGroupName, GroupScore>, item: WebsiteEvidenceItem) {
  if (item.kind !== "PAGE") return;
  const text = [item.title ?? "", ...item.headings].join(" ").toLowerCase();

  if (/product|produto|产品|制品|商品|shop|store/i.test(text)) {
    addScore(scores, "product_catalog", 20, "标题/标题包含产品信号");
  }
  if (/about|关于|品牌|brand|company|公司|企业|who.we.are/i.test(text)) {
    addScore(scores, "brand_about", 25, "标题/标题包含公司或品牌信号");
  }
  if (/contact|联系|contact.us|get.in.touch/i.test(text)) {
    addScore(scores, "contact_channel", 25, "标题/标题包含联系方式信号");
  }
  if (/price|价格|pricing|wholesale|批发/i.test(text)) {
    addScore(scores, "price_region", 30, "标题/标题包含价格信号");
  }
  if (/oem|odm|custom|定制|private.label/i.test(text)) {
    addScore(scores, "oem_opportunity", 35, "标题/标题包含OEM/ODM信号");
  }
}

function addContentSignalScore(scores: Map<EvidenceGroupName, GroupScore>, item: WebsiteEvidenceItem) {
  if (item.kind !== "PAGE") return;
  const text = (item.textSummary ?? "").toLowerCase();
  if (!text) return;

  if (/product|category|catalog|collection/i.test(text)) {
    addScore(scores, "product_catalog", 15, "页面内容包含产品信号");
  }
  if (/email|phone|tel|contact|联系|电话|邮箱/i.test(text)) {
    addScore(scores, "contact_channel", 20, "页面内容包含联系方式");
  }
  if (item.contacts.length >= 2) {
    addScore(scores, "contact_channel", 15, "页面包含多个联系方式");
  }
  if (/price|价格|usd|eur|cny|wholesale|msrp/i.test(text)) {
    addScore(scores, "price_region", 25, "页面内容包含价格信号");
  }
  if (item.priceSignals.length >= 2) {
    addScore(scores, "price_region", 20, "页面包含多个价格信号");
  }
  if (/oem|odm|private.label|custom.manufactur|定制|代工/i.test(text)) {
    addScore(scores, "oem_opportunity", 25, "页面内容包含OEM/ODM合作信号");
  }
  if (/about|品牌|brand|company|企业|公司|history|故事/i.test(text)) {
    addScore(scores, "brand_about", 15, "页面内容包含公司或品牌背景");
  }
}

// ── Main grouping logic ──

export function assignWebsiteEvidenceGroup(item: WebsiteEvidenceItem): EvidenceGroupAssignment {
  const scores = new Map<EvidenceGroupName, GroupScore>();

  addPageTypeScore(scores, item);
  addUrlPathScore(scores, item);
  addTitleHeadingScore(scores, item);
  addContentSignalScore(scores, item);

  // Products get product_catalog score
  if (item.kind === "PRODUCT") {
    addScore(scores, "product_catalog", 85, "产品结构化数据");
    if (item.priceSignals.length > 0) {
      addScore(scores, "price_region", 30, "产品包含价格信号");
    }
  }

  // Contacts get contact_channel score
  if (item.kind === "CONTACT") {
    addScore(scores, "contact_channel", 90, "联系方式结构化数据");
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  const best = ranked[0];

  if (!best || best.score < 40) {
    return {
      sourceId: item.sourceId,
      url: item.kind === "PAGE" ? item.url : undefined,
      title: item.kind === "PAGE" ? item.title : item.kind === "PRODUCT" ? item.name : undefined,
      primaryGroup: "uncertain",
      groups: ["uncertain"],
      confidence: 0.3,
      reasons: ["没有足够明确的页面类型、URL、标题或结构化信号"],
      selectedForAi: false
    };
  }

  const groups = ranked
    .filter((candidate) => candidate.score >= 55 || candidate.group === best.group)
    .slice(0, 3)
    .map((candidate) => candidate.group);

  return {
    sourceId: item.sourceId,
    url: item.kind === "PAGE" ? item.url : undefined,
    title: item.kind === "PAGE" ? item.title : item.kind === "PRODUCT" ? item.name : undefined,
    primaryGroup: best.group,
    groups,
    confidence: Math.min(best.score / 100, 1),
    reasons: best.reasons,
    selectedForAi: best.score >= 55
  };
}

// ── Group builder ──

export function buildWebsiteGroups(
  evidence: WebsiteEvidenceItem[],
  result: WebsiteAnalysisResult
): WebsiteEvidenceGroup[] {
  const sourceIndex = buildSourceIndex(evidence);
  const assignments = evidence.map(assignWebsiteEvidenceGroup);
  const groupMap = new Map<EvidenceGroupName, WebsiteEvidenceItem[]>();

  for (const assignment of assignments) {
    if (!assignment.selectedForAi) continue;
    const groupName = assignment.primaryGroup;
    const existing = groupMap.get(groupName) ?? [];
    // Dedupe by sourceId within group
    if (!existing.some((item) => item.sourceId === assignment.sourceId)) {
      const item = evidence.find((e) => e.sourceId === assignment.sourceId);
      if (item) existing.push(item);
    }
    groupMap.set(groupName, existing);
  }

  const groups: WebsiteEvidenceGroup[] = [];

  for (const groupName of ALL_GROUP_NAMES) {
    const items = groupMap.get(groupName) ?? [];
    // Fallback: product group empty but crawler found products
    if (groupName === "product_catalog" && !items.length && result.products.length) {
      const fallbackItems = result.products.slice(0, 12).map((product, index) => {
        const sourceId = `product:${index}`;
        if (!sourceIndex.has(sourceId)) return undefined;
        return evidence.find((e) => e.sourceId === sourceId);
      }).filter((item): item is WebsiteEvidenceItem => Boolean(item));
      if (fallbackItems.length) {
        groups.push({ groupName, items: fallbackItems, sourceIds: fallbackItems.map((item) => item.sourceId) });
        continue;
      }
    }
    // Fallback: contact group empty but crawler found contacts
    if (groupName === "contact_channel" && !items.length && result.contacts.length) {
      const fallbackItems = result.contacts.slice(0, 8).map((_, index) => {
        const sourceId = `contact:${index}`;
        if (!sourceIndex.has(sourceId)) return undefined;
        return evidence.find((e) => e.sourceId === sourceId);
      }).filter((item): item is WebsiteEvidenceItem => Boolean(item));
      if (fallbackItems.length) {
        groups.push({ groupName, items: fallbackItems, sourceIds: fallbackItems.map((item) => item.sourceId) });
        continue;
      }
    }
    if (items.length) {
      groups.push({ groupName, items, sourceIds: items.map((item) => item.sourceId) });
    }
  }

  // Small website: return lightweight whole-site group including product/contact evidence
  if (isSmallWebsite(result)) {
    const pageItems = evidence.filter((item) =>
      item.kind === "PAGE" && !item.errorMessage &&
      item.pageType !== "SUPPORT" && item.pageType !== "OTHER"
    );
    const productItems = evidence.filter((item) => item.kind === "PRODUCT");
    const contactItems = evidence.filter((item) => item.kind === "CONTACT");
    const wholeSiteItems = [...pageItems, ...productItems, ...contactItems].slice(0, 12);
    if (wholeSiteItems.length) {
      return [{
        groupName: "brand_about",
        items: wholeSiteItems,
        sourceIds: wholeSiteItems.map((item) => item.sourceId)
      }];
    }
  }

  return groups;
}

const ALL_GROUP_NAMES: EvidenceGroupName[] = [
  "brand_about",
  "product_catalog",
  "contact_channel",
  "price_region",
  "oem_opportunity",
  "risk_signal",
  "uncertain"
];

function isSmallWebsite(result: WebsiteAnalysisResult): boolean {
  const validPages = result.pages.filter((page) => !page.errorMessage);
  return validPages.length <= 3 && result.products.length <= 5;
}
