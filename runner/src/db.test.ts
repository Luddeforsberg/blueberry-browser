import { describe, expect, it, vi } from "vitest";
import type { GalleryServer, ServerSession } from "../../src/main/galleryServer";
import { runnerSession, supabaseDb, type DbConfig } from "./db";

const CONFIG: DbConfig = { url: "https://abc.supabase.co", key: "sb_publishable_x", email: "runner@example.com", password: "pw", owner: "ana@example.com" };

// Sign-ins and refreshes as Supabase's Auth answers them, each with a new token.
const fakeAuth = ({ refreshWorks = true, expiresInMs = 3_600_000 } = {}) => {
  let made = 0;
  const session = (): ServerSession => ({ accessToken: `token-${++made}`, refreshToken: `refresh-${made}`, expiresAt: Date.now() + expiresInMs, email: CONFIG.email });
  return {
    signIn: vi.fn(async () => session()),
    refresh: vi.fn(async () => {
      if (!refreshWorks) throw new Error("refused");
      return session();
    }),
  };
};

describe("the runner's own sign-in", () => {
  it("signs in once, as itself, and keeps the token while it's good", async () => {
    const auth = fakeAuth();
    const session = runnerSession(CONFIG, auth as unknown as GalleryServer);
    expect(await Promise.all([session.token(), session.token()])).toEqual(["token-1", "token-1"]);
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    expect(auth.signIn).toHaveBeenCalledWith("runner@example.com", "pw");
  });

  it("refreshes near the end, and signs in again if the refresh is refused", async () => {
    const refreshing = fakeAuth({ expiresInMs: 1_000 });
    const one = runnerSession(CONFIG, refreshing as unknown as GalleryServer);
    await one.token();
    expect(await one.token()).toBe("token-2");
    expect(refreshing.refresh).toHaveBeenCalledWith("refresh-1", "runner@example.com");

    const refused = fakeAuth({ refreshWorks: false, expiresInMs: 1_000 });
    const two = runnerSession(CONFIG, refused as unknown as GalleryServer);
    await two.token();
    expect(await two.token()).toBe("token-2");
    expect(refused.signIn).toHaveBeenCalledTimes(2);
  });

  it("tries a call once more with a new session when the server refuses the token", async () => {
    const auth = fakeAuth();
    const sent: string[] = [];
    const send = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const authorization = (init?.headers as Record<string, string>).authorization;
      sent.push(authorization);
      return new Response(authorization === "Bearer token-1" ? "" : "true", { status: authorization === "Bearer token-1" ? 401 : 200 });
    });
    const db = supabaseDb(CONFIG, runnerSession(CONFIG, auth as unknown as GalleryServer), send as unknown as typeof fetch);
    expect(await db.accept()).toBe(true);
    expect(sent).toEqual(["Bearer token-1", "Bearer token-2"]);
  });
});

describe("the runner's writes", () => {
  it("cuts a reply, an error and steps to the row's limits, so how a job ended is saved", async () => {
    const bodies: Record<string, unknown>[] = [];
    const send = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response("false", { status: 200 });
    });
    const db = supabaseDb(CONFIG, runnerSession(CONFIG, fakeAuth() as unknown as GalleryServer), send as unknown as typeof fetch);
    const steps = Array.from({ length: 501 }, (_, index) => ({ text: `Step ${index}`, done: true }));
    expect(await db.update("job-1", { status: "done", reply: "🫐".repeat(40_001), error: "x".repeat(501), steps })).toBe(false);
    const [body] = bodies as { p_status: string; p_reply: string; p_error: string; p_steps: unknown[] }[];
    expect(body.p_status).toBe("done");
    expect(Array.from(body.p_reply)).toHaveLength(40_000);
    expect(body.p_reply.endsWith(" (cut short)")).toBe(true);
    expect(body.p_error).toHaveLength(500);
    expect(body.p_steps).toHaveLength(500);
  });
});
