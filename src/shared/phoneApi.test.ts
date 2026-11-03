import { afterAll, describe, expect, it, vi } from "vitest";
import { CALL_DEADLINE_MS } from "./phoneCalls";

// The phone page's own site/app/api.js, as the browser runs it, with a stand-in for the network and localStorage.

vi.mock("../../site/config.js", () => ({ SUPABASE_URL: "https://server.example", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }));

const kept = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
  removeItem: (key: string) => void kept.delete(key),
});
// A session that's about to run out, so the next call refreshes it first.
kept.set("blueberry.session", JSON.stringify({ accessToken: "old", refreshToken: "refresh-1", expiresAt: Date.now() + 1_000, email: "ana@example.com", userId: "u-1" }));

type Answer = (url: string, init: RequestInit) => Promise<Response>;
const asked: string[] = [];
let answer: Answer = async () => new Response("null");
vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
  asked.push(new URL(url).pathname + new URL(url).search);
  return answer(url, init);
});

// A request that never comes back, until it's aborted.
const hangs: Answer = (_, init) =>
  new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));

const API = new URL("../../site/app/api.js", import.meta.url).href;
const api = (await import(/* @vite-ignore */ API)) as {
  flock: () => Promise<unknown[]>;
  signedIn: () => { email: string } | null;
};

describe("the phone page's calls", () => {
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("lets go of a token refresh that hangs, stays signed in, and refreshes afresh on the next call", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    answer = hangs;
    const first = api.flock();
    const failed = expect(first).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(CALL_DEADLINE_MS);
    await failed;
    expect(asked).toEqual(["/auth/v1/token?grant_type=refresh_token"]);
    expect(api.signedIn()).toEqual({ email: "ana@example.com", userId: "u-1" });

    answer = async (url) =>
      url.includes("/auth/v1/token")
        ? new Response(JSON.stringify({ access_token: "new", refresh_token: "refresh-2", expires_in: 3600, user: { id: "u-1", email: "ana@example.com" } }))
        : new Response(JSON.stringify([{ id: "m-1" }]));
    expect(await api.flock()).toEqual([{ id: "m-1" }]);
    expect(asked.slice(1)).toEqual(["/auth/v1/token?grant_type=refresh_token", expect.stringMatching(/^\/rest\/v1\/cloud_flock/)]);
  });
});
