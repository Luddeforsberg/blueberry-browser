// A page's text through Firecrawl, for the `fetch_page` tool, without opening a tab. Plain Node, so the cloud runner gets
// it too. The key stays in here: it never goes into a result, an error, a log or the disk.

export interface FetchedPage {
  // Where the page really was, after any redirect, as Firecrawl says.
  url: string;
  // The site's own answer, such as 404, if Firecrawl says.
  status: number | null;
  markdown: string;
}

// `stopped` says whether the job has ended, so nothing goes out again after it.
export type WebFetch = (
  url: string,
  stopped?: () => boolean,
) => Promise<FetchedPage>;

// docs.firecrawl.dev/api-reference/endpoint/scrape, checked on 2026-11-06. A page costs 1 credit, and a PDF 1 more for
// each page of it, so a PDF is read only as far as `PDF_PAGES`.
const ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const PDF_PAGES = 10;
const TIMEOUT_MS = 30_000;
// A copy Firecrawl already has is used if it's no older than this, since a routine is often asking what's new.
const MAX_AGE_MS = 60 * 60 * 1000;
// Far more than a tool result keeps, and enough to stop a huge page being held in memory.
const MAX_MARKDOWN = 500_000;
// docs.firecrawl.dev/rate-limits: the free plan takes 10 pages a minute and answers 429 past that. A model often asks for
// more at once, so a busy answer waits and tries again rather than sending it to open a tab for each.
const BUSY_WAITS_MS = [20_000, 40_000];

// Errors are ours, worded so nothing from the request goes with them.
export class WebFetchError extends Error {}

// Null with no key, so the tool isn't offered at all.
export const firecrawlFetch = (
  env: Record<string, string | undefined> = process.env,
): WebFetch | null => {
  const key = env.FIRECRAWL_API_KEY?.trim();
  if (!key) return null;
  const scrape = async (url: string) => {
    try {
      return await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        // Only the main content, as markdown. Not kept in Firecrawl's index, since an address can be the user's business.
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
          maxAge: MAX_AGE_MS,
          storeInCache: false,
          parsers: [{ type: "pdf", maxPages: PDF_PAGES }],
          timeout: TIMEOUT_MS,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS + 5_000),
      });
    } catch {
      throw new WebFetchError("The page service couldn't be reached.");
    }
  };
  return async (url, stopped = () => false) => {
    let response = await scrape(url);
    for (const wait of BUSY_WAITS_MS) {
      if (response.status !== 429) break;
      await new Promise((resolve) => setTimeout(resolve, wait));
      if (stopped()) break;
      response = await scrape(url);
    }
    if (!response.ok)
      throw new WebFetchError(`The page service answered ${response.status}.`);
    const body = (await response.json().catch(() => null)) as {
      data?: unknown;
    } | null;
    return parsePage(body?.data, url);
  };
};

// Only the text and where it came from, however much else the service sends. With no address of its own that's a web
// address, the page counts as the one asked for.
export const parsePage = (data: unknown, asked: string): FetchedPage => {
  const { markdown, metadata } = (data ?? {}) as {
    markdown?: unknown;
    metadata?: { url?: unknown; statusCode?: unknown };
  };
  const final = typeof metadata?.url === "string" ? metadata.url.trim() : "";
  const parsed = URL.canParse(final) ? new URL(final) : null;
  const status = metadata?.statusCode;
  return {
    // As the browser reads it, so nothing like a line break stays in it.
    url:
      parsed && ["http:", "https:"].includes(parsed.protocol)
        ? parsed.href
        : asked,
    status: Number.isInteger(status) ? (status as number) : null,
    markdown:
      typeof markdown === "string"
        ? markdown.trim().slice(0, MAX_MARKDOWN)
        : "",
  };
};
