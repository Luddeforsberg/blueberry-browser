import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The phone page's own site/app/api.js and state.js, as the browser runs them, with a stand-in for the network and
// storage: what the page knows of one account, and what it reads from the server for it.

vi.mock("../../site/config.js", () => ({ SUPABASE_URL: "https://server.example", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }));

const storage = () => {
  const kept = new Map<string, string>();
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
};
const local = storage();
vi.stubGlobal("localStorage", local);
vi.stubGlobal("sessionStorage", storage());
const ALICE = {
  accessToken: "alice",
  refreshToken: "r-alice",
  expiresAt: Date.now() + 3_600_000,
  email: "alice@example.com",
  userId: "u-alice",
};
local.setItem("blueberry.session", JSON.stringify(ALICE));

type Answer = (url: string) => Promise<Response>;
let answer: Answer = async () => new Response("[]");
const asked: string[] = [];
vi.stubGlobal("fetch", (url: string) => {
  asked.push(decodeURIComponent(new URL(url).pathname + new URL(url).search));
  return answer(url);
});

interface Turn {
  current: boolean;
}
const api = (await import(/* @vite-ignore */ new URL("../../site/app/api.js", import.meta.url).href)) as {
  jobs: () => Promise<Array<{ id: string; status: string; ask: unknown }>>;
  mascots: () => Promise<unknown[]>;
  rpc: (name: string) => Promise<unknown>;
  signIn: (email: string, password: string) => Promise<void>;
  signedIn: () => { email: string } | null;
  accountTurn: () => Turn;
};
const phone = (await import(/* @vite-ignore */ new URL("../../site/app/state.js", import.meta.url).href)) as {
  state: {
    jobs: unknown[] | null;
    linked: boolean | null;
    mascotsShared: string | null;
    drafts: Map<string, string>;
    answered: Set<string>;
  };
};

const job = (id: string, status = "done") => ({ id, status, conversation_id: id, created_at: "2026-11-20T10:00:00Z" });
const json = (body: unknown) => new Response(JSON.stringify(body));

// Signed in as Alice, until the last test lets her session run out.
describe("the phone page's account", () => {
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => {
    asked.length = 0;
  });

  it("finds a job that has waited since before the hundred newest", async () => {
    const newest = Array.from({ length: 100 }, (_, n) => job(`done-${n}`));
    answer = async (url) => {
      if (url.includes("rpc/my_cloud_jobs")) return json([{ id: "waiting-long", approval_id: "a-1" }]);
      if (decodeURIComponent(url).includes("status=in.(queued,running,waiting)")) return json([job("waiting-long", "waiting")]);
      return json(newest);
    };
    const jobs = await api.jobs();
    expect(jobs).toHaveLength(101);
    expect(jobs.find(({ id }) => id === "waiting-long")).toMatchObject({ status: "waiting", ask: { approval_id: "a-1" } });
  });

  it("fails on a successful answer it can't read, or one that isn't a list, rather than read it as nothing", async () => {
    answer = async () => new Response('[{"id":"m-1"', { status: 200 });
    await expect(api.mascots()).rejects.toMatchObject({ status: 200 });
    await expect(api.jobs()).rejects.toMatchObject({ status: 200 });
    answer = async () => json(null);
    await expect(api.mascots()).rejects.toMatchObject({ status: 200 });
    answer = async () => json([]);
    expect(await api.mascots()).toEqual([]);
    // Not a list, as starting a job answers, and still not read as nothing.
    answer = async () => new Response('"6f1c', { status: 200 });
    await expect(api.rpc("start_cloud_job")).rejects.toMatchObject({ status: 200 });
  });

  it("forgets everything of an account whose session ran out, and drops what was asked for it, before anyone else signs in", async () => {
    Object.assign(phone.state, { jobs: [job("alice-job")], linked: true, mascotsShared: "2026-11-20" });
    phone.state.drafts.set("", "Alice's unsent words");
    phone.state.answered.add("alice-approval");
    const polling = api.accountTurn();

    answer = async () => new Response(JSON.stringify({ message: "JWT expired" }), { status: 401 });
    await expect(api.jobs()).rejects.toMatchObject({ status: 401 });
    expect(api.signedIn()).toBeNull();
    expect(polling.current).toBe(false);
    expect(phone.state).toMatchObject({ jobs: null, linked: null, mascotsShared: null });
    expect(phone.state.drafts.size).toBe(0);
    expect(phone.state.answered.size).toBe(0);

    // Bob signs in on the same page, and his first poll is still out: nothing of Alice's is there to draw meanwhile.
    answer = async () =>
      json({ access_token: "bob", refresh_token: "r-bob", expires_in: 3600, user: { id: "u-bob", email: "bob@example.com" } });
    await api.signIn("bob@example.com", "password");
    expect(api.signedIn()).toMatchObject({ email: "bob@example.com" });
    expect(phone.state.jobs).toBeNull();
    expect(phone.state.drafts.size).toBe(0);
    expect(api.accountTurn().current).toBe(true);
  });
});
