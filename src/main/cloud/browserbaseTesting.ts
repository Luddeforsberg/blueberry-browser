import type { Browser } from "playwright-core";
import { browserbase } from "./browserbase";
import { NO_IDS, type CloudIds } from "./cloudProvider";

// A stubbed fetch shaped from Browserbase's API reference, for its tests. Nothing here has talked to the real service.

export interface Call {
  method: string;
  url: string;
  key: string | null;
  body: Record<string, unknown> | null;
}

// Every request with a body sends it as JSON text, so anything else fails the test.
const jsonText = (body: BodyInit): string => {
  if (typeof body !== "string") throw new Error("Expected a JSON string body");
  return body;
};

export const stub = (answers: Record<string, { status?: number; body: unknown }>) => {
  const calls: Call[] = [];
  const send = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url,
      key: new Headers(init.headers).get("X-BB-API-Key"),
      body: init.body ? JSON.parse(jsonText(init.body)) : null,
    });
    // A listing by metadata matches its own address first, then any listing.
    const path = `${method} ${url.replace("https://api.browserbase.com/v1", "")}`;
    const answer = answers[path] ?? answers[path.replace(/\?q=.*$/, "?q=*")];
    if (!answer) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as typeof fetch;
  return { calls, send };
};

export const fakeBrowser = () => {
  let closed = false;
  const context = { name: "context", route: async () => {}, on: () => {}, browser: () => null };
  const browser = { contexts: () => [context], close: async () => void (closed = true) } as unknown as Browser;
  return { browser, closed: () => closed };
};

export const provider = (
  send: typeof fetch,
  connect: (url: string) => Promise<Browser> = async () => fakeBrowser().browser,
  mark?: string,
) => browserbase({ apiKey: "k", projectId: "p", fetch: send, connect, ...(mark ? { mark } : {}) });

export const at = (ids: Partial<CloudIds>): CloudIds => ({ ...NO_IDS, ...ids });

export const listing = (tag: string, field = "blueberry") => `GET /sessions?q=user_metadata%5B'${field}'%5D%3A'${tag}'`;

export const releases = (calls: Call[], id: string) =>
  calls.filter(({ method, url, body }) => method === "POST" && url.endsWith(`/sessions/${id}`) && body?.status === "REQUEST_RELEASE");
