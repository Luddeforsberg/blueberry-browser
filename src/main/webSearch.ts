// A web search through Firecrawl, for the `web_search` tool. Plain Node, so the cloud runner gets it too. The key stays
// in here: it never goes into a result, an error, a log or the disk.

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export type WebSearch = (query: string) => Promise<SearchResult[]>;

// docs.firecrawl.dev/api-reference/endpoint/search, checked on 2026-11-05. Without scraping, 1 to 10 results cost 2 credits.
const ENDPOINT = "https://api.firecrawl.dev/v2/search";
const RESULTS = 5;
const TIMEOUT_MS = 20_000;

// Errors are ours, worded so nothing from the request goes with them.
export class WebSearchError extends Error {}

// Null with no key, so the tool isn't offered at all.
export const firecrawlSearch = (
  env: Record<string, string | undefined> = process.env,
): WebSearch | null => {
  const key = env.FIRECRAWL_API_KEY?.trim();
  if (!key) return null;
  return async (query) => {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        // Without highlights, each result's snippet is the site's own description.
        body: JSON.stringify({
          query,
          limit: RESULTS,
          sources: [{ type: "web" }],
          highlights: false,
          timeout: TIMEOUT_MS,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS + 5_000),
      });
    } catch {
      throw new WebSearchError("The search service couldn't be reached.");
    }
    if (!response.ok)
      throw new WebSearchError(
        `The search service answered ${response.status}.`,
      );
    const body = (await response.json().catch(() => null)) as {
      data?: { web?: unknown };
    } | null;
    return parseResults(body?.data?.web);
  };
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

// Only what's needed, and only web addresses, however much else the service sends.
export const parseResults = (web: unknown): SearchResult[] =>
  (Array.isArray(web) ? web : [])
    .flatMap((item: Record<string, unknown> | null) => {
      const address = text(item?.url, 2000);
      if (!URL.canParse(address)) return [];
      // As the browser reads it, so nothing like a line break stays in it.
      const { href, protocol } = new URL(address);
      if (protocol !== "http:" && protocol !== "https:") return [];
      return [
        {
          title: text(item?.title, 200),
          url: href,
          snippet: text(item?.description, 400),
        },
      ];
    })
    .slice(0, RESULTS);
