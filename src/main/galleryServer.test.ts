import { describe, expect, it } from "vitest";
import { publicPageLink, serverConfig } from "./galleryServer";

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
