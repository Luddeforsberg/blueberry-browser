import { afterEach, describe, expect, it, vi } from "vitest";
import { GalleryServer, publicPageLink, serverConfig } from "./galleryServer";

const KEY = "sb_publishable_abc";

describe("serverConfig", () => {
  it("is off with either value missing", () => {
    expect(serverConfig(undefined, KEY, false)).toBeNull();
    expect(serverConfig("", KEY, false)).toBeNull();
    expect(serverConfig("https://x.supabase.co", undefined, false)).toBeNull();
  });

  it("takes a publishable key over https", () => {
    expect(serverConfig("https://x.supabase.co/", KEY, true)).toEqual({ url: "https://x.supabase.co", key: KEY });
  });

  it.each(["sb_secret_abc", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x", ""])("refuses %j as a key", (key) => {
    expect(serverConfig("https://x.supabase.co", key, false)).toBeNull();
  });

  it("only lets an unpackaged app use a local server, and never plain http elsewhere", () => {
    expect(serverConfig("http://127.0.0.1:9", KEY, false)).toEqual({ url: "http://127.0.0.1:9", key: KEY });
    expect(serverConfig("http://127.0.0.1:9", KEY, true)).toBeNull();
    expect(serverConfig("http://x.supabase.co", KEY, false)).toBeNull();
    expect(serverConfig("not an address", KEY, false)).toBeNull();
  });
});

describe("publicPageLink", () => {
  it("is null until the site's address is set, and only over https", () => {
    expect(publicPageLink(undefined, "a")).toBeNull();
    expect(publicPageLink("", "a")).toBeNull();
    expect(publicPageLink("http://example.com", "a")).toBeNull();
    expect(publicPageLink("https://a.pages.dev/", "x y")).toBe("https://a.pages.dev/m/?id=x%20y");
  });
});

describe("a conversation's jobs", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The server as PostgREST pages it: `limit` and `offset` over this many jobs.
  const serving = (total: number) => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      const { searchParams } = new URL(url);
      const offset = Number(searchParams.get("offset"));
      const limit = Number(searchParams.get("limit"));
      const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, index) => ({ id: `job-${offset + index}` }));
      return new Response(JSON.stringify(rows), { status: 200 });
    });
    return asked;
  };
  const server = new GalleryServer({ url: "https://example.supabase.co", key: "sb_publishable_x" });

  it.each([0, 1, 100, 101, 250])("comes whole however long it is: %i", async (total) => {
    const asked = serving(total);
    const rows = await server.cloudConversation("token", "c-1");
    expect(rows.map(({ id }) => id)).toEqual(Array.from({ length: total }, (_, index) => `job-${index}`));
    // One more page than it fills, or just the one.
    expect(asked).toHaveLength(Math.floor(total / 100) + 1);
  });
});
