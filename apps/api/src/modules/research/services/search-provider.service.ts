import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
};

export type SearchResponse = {
  enabled: boolean;
  provider: string;
  warning?: string;
  queries: string[];
  results: SearchResult[];
};

@Injectable()
export class SearchProviderService {
  constructor(private readonly config: ConfigService) {}

  async searchCustomer(input: { name: string; websiteUrl?: string | null; country?: string | null }): Promise<SearchResponse> {
    const provider = this.config.get<string>("SEARCH_PROVIDER", "").toLowerCase();
    const apiKey = this.config.get<string>("SEARCH_API_KEY");
    const queries = buildQueries(input);
    if (!provider || !apiKey) {
      return {
        enabled: false,
        provider: provider || "none",
        warning: "未启用公开网络搜索，背调范围仅包含官网分析与CRM内部资料。",
        queries,
        results: []
      };
    }

    try {
      const results =
        provider === "tavily"
          ? await this.searchTavily(queries, apiKey)
          : provider === "serpapi"
            ? await this.searchSerpApi(queries, apiKey)
            : await this.searchCustom(queries, apiKey);
      return {
        enabled: true,
        provider,
        queries,
        results: dedupeResults(results).slice(0, 12)
      };
    } catch (error) {
      return {
        enabled: true,
        provider,
        warning: error instanceof Error ? error.message : "公开网络搜索失败，已降级为官网与CRM资料。",
        queries,
        results: []
      };
    }
  }

  private async searchTavily(queries: string[], apiKey: string) {
    const endpoint = this.config.get<string>("SEARCH_BASE_URL", "https://api.tavily.com/search");
    const results: SearchResult[] = [];
    for (const query of queries.slice(0, 3)) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, query, search_depth: "basic", max_results: 5, include_answer: false })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Tavily search failed");
      results.push(
        ...((json.results ?? []) as Array<{ title?: string; url?: string; content?: string }>).map((item) => ({
          title: item.title ?? item.url ?? query,
          url: item.url ?? "",
          snippet: item.content,
          source: "tavily"
        }))
      );
    }
    return results.filter((item) => item.url);
  }

  private async searchSerpApi(queries: string[], apiKey: string) {
    const endpoint = this.config.get<string>("SEARCH_BASE_URL", "https://serpapi.com/search.json");
    const results: SearchResult[] = [];
    for (const query of queries.slice(0, 3)) {
      const url = new URL(endpoint);
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", query);
      url.searchParams.set("api_key", apiKey);
      const response = await fetch(url);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "SerpAPI search failed");
      results.push(
        ...((json.organic_results ?? []) as Array<{ title?: string; link?: string; snippet?: string }>).map((item) => ({
          title: item.title ?? item.link ?? query,
          url: item.link ?? "",
          snippet: item.snippet,
          source: "serpapi"
        }))
      );
    }
    return results.filter((item) => item.url);
  }

  private async searchCustom(queries: string[], apiKey: string) {
    const endpoint = this.config.get<string>("SEARCH_BASE_URL");
    if (!endpoint) throw new Error("SEARCH_BASE_URL is required for custom search provider");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ queries, maxResults: 12 })
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error?.message ?? json.message ?? "Custom search failed");
    const rawResults = Array.isArray(json.results) ? json.results : Array.isArray(json.data) ? json.data : [];
    return rawResults
      .map((item: { title?: string; url?: string; link?: string; snippet?: string; content?: string }) => ({
        title: item.title ?? item.url ?? item.link ?? "Search result",
        url: item.url ?? item.link ?? "",
        snippet: item.snippet ?? item.content,
        source: "custom"
      }))
      .filter((item: SearchResult) => item.url);
  }
}

function buildQueries(input: { name: string; websiteUrl?: string | null; country?: string | null }) {
  const domain = input.websiteUrl ? safeDomain(input.websiteUrl) : "";
  return [
    `"${input.name}" company profile`,
    `"${input.name}" products brand`,
    `"${input.name}" OEM ODM supplier distributor`,
    domain ? `site:${domain} products` : "",
    input.country ? `"${input.name}" ${input.country}` : ""
  ].filter(Boolean);
}

function safeDomain(value: string) {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function dedupeResults(results: SearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = result.url.replace(/\/$/, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
