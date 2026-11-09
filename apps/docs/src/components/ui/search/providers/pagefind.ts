import { mergeSearchIndexes } from "@cloudflare/nimbus-docs/client";
import type { SearchProvider, SearchResult } from "@cloudflare/nimbus-docs/types";

export type SectionedSearchResult = SearchResult & { section?: string };
import { config, searchIndex } from "virtual:nimbus/config";

interface PagefindSubResult {
  title?: string;
  url?: string;
}

interface PagefindResultData {
  url: string;
  excerpt?: string;
  meta?: { title?: string; section?: string };
  sub_results?: PagefindSubResult[];
}

interface PagefindSearchResponse {
  results: Array<{ data(): Promise<PagefindResultData> }>;
}

interface PagefindFilters {
  [key: string]: string | string[] | { none?: string | string[]; any?: string | string[] };
}

interface PagefindApi {
  init(): Promise<void>;
  options(options: { baseUrl?: string; ranking?: { pageLength?: number } }): Promise<void>;
  mergeIndex(indexPath: string, options?: { baseUrl?: string }): Promise<void>;
  search(query: string, options?: { filters?: PagefindFilters }): Promise<PagefindSearchResponse>;
}

let pagefind: PagefindApi | undefined;

const defaultFilters: PagefindFilters | undefined =
  config.versions && config.versions.deprecated && config.versions.deprecated.length > 0
    ? { status: { none: "deprecated" } }
    : undefined;

export const provider: SearchProvider = {
  async init() {
    if (pagefind) return;
    const pagefindUrl = new URL(`${searchIndex.bundle}pagefind.js`, window.location.origin);
    const loaded = (await import(/* @vite-ignore */ pagefindUrl.href)) as PagefindApi;
    const baseUrl = `${(import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "")}/`;
    await loaded.options({ baseUrl, ranking: { pageLength: 0.2 } });
    await loaded.init();
    await mergeSearchIndexes(loaded, searchIndex.merge, { baseUrl });
    pagefind = loaded;
  },

  async search(query) {
    if (!pagefind) await this.init?.();
    if (!pagefind) return [];

    const search = await pagefind.search(
      query,
      defaultFilters ? { filters: defaultFilters } : undefined,
    );
    const results = await Promise.all(search.results.slice(0, 10).map((result) => result.data()));
    return results.map((result) => ({
      title: result.meta?.title ?? "Untitled",
      section: result.meta?.section,
      url: result.url,
      snippet: result.excerpt,
      subResults: result.sub_results
        ?.filter((sub): sub is Required<PagefindSubResult> => Boolean(sub.title && sub.url))
        .filter((sub) => sub.title !== result.meta?.title)
        .map((sub) => ({ title: sub.title, url: sub.url })),
    }));
  },
};
