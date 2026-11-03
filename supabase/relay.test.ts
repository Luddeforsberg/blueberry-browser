import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// The relay's grants and functions, in real Postgres as Supabase's roles, on top of every migration before it.
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const MASCOT = `'{"id":"berry","name":"Berry","sites":[],"tools":["visit","click","type"]}'::jsonb`;

describe("the relay's grants", () => {
  let db: PGlite;
  const as = async <T = Record<string, unknown>>(uid: string | null, sql: string): Promise<T[]> => {
    await db.exec(`set test.uid = '${uid ?? ""}'; set role ${uid ? "authenticated" : "anon"};`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const one = async (uid: string | null, sql: string) => Object.values((await as(uid, sql))[0])[0];
  let users = 0;
  const newUser = async () => {
    const id = `00000000-0000-4000-8000-${String(++users).padStart(12, "0")}`;
    await db.query("insert into auth.users values ($1, $2)", [id, `user${users}@example.com`]);
    return id;
  };
  const emailOf = (id: string) => `user${Number(id.slice(-12))}@example.com`;
  const link = async (owner: string, runner: string) => {
    await as(owner, `select public.link_cloud_runner('${emailOf(runner)}')`);
    await as(runner, `select public.accept_cloud_runner_link('${emailOf(owner)}')`);
  };
  const grant = async (owner: string) => String(await one(owner, "select public.create_relay_grant()"));
  // Every relay function, as `uid` with `secret`, each either answering or refused.
  const everyCall = (secret: string, job = "00000000-0000-4000-8000-000000000000") => [
    `select * from public.relay_flock('${secret}')`,
    `select public.relay_start_job('${secret}', 'Go', ${MASCOT})`,
    `select * from public.relay_jobs('${secret}', null)`,
    `select public.relay_stop_job('${secret}', '${job}')`,
    `select public.relay_revoke_grant('${secret}')`,
  ];
  const refusesAll = async (uid: string, secret: string) => {
    for (const sql of everyCall(secret)) await expect(as(uid, sql), sql).rejects.toThrow(/Not a grant of this runner/);
  };

  let ALICE = "";
  let RUNNER = "";
  let BOB = "";
  let BOBS_RUNNER = "";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of ["20261102000000_cloud_jobs.sql", "20261103000000_phone.sql", "20261104000000_cloud_conversations.sql", "20261105000000_cloud_routines.sql", "20261106000000_cloud_relay.sql"]) {
      await db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
    }
  });
  beforeEach(async () => {
    [ALICE, RUNNER, BOB, BOBS_RUNNER] = [await newUser(), await newUser(), await newUser(), await newUser()];
    await link(ALICE, RUNNER);
    await link(BOB, BOBS_RUNNER);
  });
  afterAll(() => db.close());

  it("is made only by an owner with an accepted runner, and its secret is kept only as a hash", async () => {
    const lonely = await newUser();
    await expect(as(lonely, "select public.create_relay_grant()")).rejects.toThrow(/No runner/);
    await expect(as(RUNNER, "select public.create_relay_grant()")).rejects.toThrow(/A runner has no grants/);
    await expect(as(null, "select public.create_relay_grant()")).rejects.toThrow();
    const secret = await grant(ALICE);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const [row] = (await db.query<Record<string, unknown>>("select * from public.cloud_relay_grants where owner = $1", [ALICE])).rows;
    expect(row).toMatchObject({ runner: RUNNER, revoked_at: null });
    expect(JSON.stringify(row)).not.toContain(secret);
    // Nobody reads the table.
    await expect(as(ALICE, "select * from public.cloud_relay_grants")).rejects.toThrow(/permission denied/);
  });

  it("lets the runner act as the owner, only on the grant's own jobs", async () => {
    await db.query("insert into public.cloud_flock (owner, id, position, name, palette, accessory, instructions) values ($1, 'scout', 0, 'Scout', 'robin', 'none', 'Finds')", [ALICE]);
    const own = String(await one(ALICE, `select public.start_cloud_job('Mine', '[]', ${MASCOT}, 'risky', 'ctx-1')`));
    const secret = await grant(ALICE);
    expect(await as(RUNNER, `select id, name from public.relay_flock('${secret}')`)).toEqual([{ id: "scout", name: "Scout" }]);
    const job = String(await one(RUNNER, `select public.relay_start_job('${secret}', 'Find tea', ${MASCOT})`));
    const [row] = (await db.query<Record<string, unknown>>("select owner, prompt, action_approval, context_id, conversation_id::text from public.cloud_jobs where id = $1", [job])).rows;
    expect(row).toEqual({ owner: ALICE, prompt: "Find tea", action_approval: "risky", context_id: "ctx-1", conversation_id: job });
    // The owner's own job isn't the grant's.
    expect((await as<{ id: string }>(RUNNER, `select id from public.relay_jobs('${secret}', null)`)).map(({ id }) => id)).toEqual([job]);
    expect(await as(RUNNER, `select id from public.relay_jobs('${secret}', array['${own}']::uuid[])`)).toEqual([]);
    expect(await one(RUNNER, `select public.relay_stop_job('${secret}', '${own}')`)).toBe(false);
    expect(await one(RUNNER, `select public.relay_stop_job('${secret}', '${job}')`)).toBe(true);
    expect((await as(RUNNER, `select status from public.relay_jobs('${secret}', array['${job}']::uuid[])`))[0]).toEqual({ status: "stopped" });
  });

  it("is refused for anyone but its own runner, and with a wrong secret", async () => {
    const secret = await grant(ALICE);
    await refusesAll(BOBS_RUNNER, secret);
    await refusesAll(ALICE, secret);
    await refusesAll(BOB, secret);
    await refusesAll(RUNNER, "0".repeat(64));
  });

  it("stops working once the runner is unlinked, re-offered or replaced, or the owner disconnects", async () => {
    const unlinked = await grant(ALICE);
    await as(ALICE, "select public.unlink_cloud_runner()");
    await link(ALICE, RUNNER);
    await refusesAll(RUNNER, unlinked);

    const reoffered = await grant(ALICE);
    await as(ALICE, `select public.link_cloud_runner('${emailOf(RUNNER)}')`);
    await as(RUNNER, `select public.accept_cloud_runner_link('${emailOf(ALICE)}')`);
    await refusesAll(RUNNER, reoffered);

    const replaced = await grant(ALICE);
    const other = await newUser();
    await link(ALICE, other);
    await refusesAll(RUNNER, replaced);
    await refusesAll(other, replaced);

    const disconnected = await grant(ALICE);
    expect(await one(ALICE, "select public.revoke_relay_grants()")).toBe(1);
    await refusesAll(other, disconnected);

    const ended = await grant(ALICE);
    expect(await one(other, `select public.relay_revoke_grant('${ended}')`)).toBe(true);
    await refusesAll(other, ended);
  });

  it("has no function that can decide an approval", async () => {
    const secret = await grant(ALICE);
    const job = String(await one(RUNNER, `select public.relay_start_job('${secret}', 'Buy', ${MASCOT})`));
    await as(RUNNER, "select * from public.runner_claim_job()");
    const approval = String(await one(RUNNER, `select public.runner_ask('${job}', 'approval', 'Buy it', null, null)`));
    const functions = (await db.query<{ proname: string; prosrc: string }>("select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace and proname like 'relay\\_%'")).rows;
    expect(functions.map(({ proname }) => proname).sort()).toEqual(["relay_flock", "relay_grant", "relay_jobs", "relay_revoke_grant", "relay_start_job", "relay_stop_job"]);
    for (const { proname, prosrc } of functions) expect(prosrc, proname).not.toMatch(/cloud_approvals\s+set|decide_cloud_approval/);
    await expect(as(RUNNER, `select public.decide_cloud_approval('${approval}', true)`)).rejects.toThrow(/A runner can't decide/);
    expect((await as(RUNNER, `select approval_id::text from public.relay_jobs('${secret}', null)`))[0]).toEqual({ approval_id: approval });
    expect((await db.query("select decision from public.cloud_approvals where id = $1", [approval])).rows).toEqual([{ decision: null }]);
  });

  it("refuses a grant whose owner has since become someone's runner", async () => {
    const secret = await grant(ALICE);
    const carol = await newUser();
    await as(carol, `select public.link_cloud_runner('${emailOf(ALICE)}')`);
    // Accepting revokes Alice's own grants.
    expect(await one(ALICE, `select public.accept_cloud_runner_link('${emailOf(carol)}')`)).toBe(true);
    await refusesAll(RUNNER, secret);
    await expect(as(ALICE, `select public.start_cloud_job('Go', '[]', ${MASCOT}, 'risky', null)`)).rejects.toThrow(/A runner can't start jobs/);
    // And with the revocation undone, the check under the lock still refuses.
    await db.query("update public.cloud_relay_grants set revoked_at = null where owner = $1", [ALICE]);
    await expect(as(RUNNER, `select public.relay_start_job('${secret}', 'Go', ${MASCOT})`)).rejects.toThrow(/A runner can't start jobs/);
    expect((await db.query("select count(*)::int as n from public.cloud_jobs where owner = $1", [ALICE])).rows).toEqual([{ n: 0 }]);
  });

  it("keeps a few grants per owner at a time", async () => {
    const first = await grant(ALICE);
    for (let n = 0; n < 20; n++) await grant(ALICE);
    await refusesAll(RUNNER, first);
  });
});

describe("the relay's address", () => {
  let db: PGlite;
  const as = async (uid: string | null, sql: string) => {
    await db.exec(`set test.uid = '${uid ?? ""}'; set role ${uid ? "authenticated" : "anon"};`);
    try {
      return (await db.query<Record<string, unknown>>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const OWNER = "00000000-0000-4000-8000-000000000001";
  const RUNNER = "00000000-0000-4000-8000-000000000002";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of ["20261102000000_cloud_jobs.sql", "20261103000000_phone.sql", "20261104000000_cloud_conversations.sql", "20261105000000_cloud_routines.sql", "20261106000000_cloud_relay.sql"]) {
      await db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
    }
    await db.query("insert into auth.users values ($1, 'owner@example.com'), ($2, 'runner@example.com')", [OWNER, RUNNER]);
    await as(OWNER, "select public.link_cloud_runner('runner@example.com')");
  });
  afterAll(() => db.close());

  it("is set only by the accepted runner, only https, and read by the owner only once accepted", async () => {
    expect(await as(RUNNER, "select public.runner_set_relay_url('https://relay.example/mcp') as ok")).toEqual([{ ok: false }]);
    await as(RUNNER, "select public.accept_cloud_runner_link('owner@example.com')");
    expect(await as(OWNER, "select public.runner_set_relay_url('https://evil.example/mcp') as ok")).toEqual([{ ok: false }]);
    await expect(as(RUNNER, "select public.runner_set_relay_url('http://relay.example/mcp')")).rejects.toThrow(/relay_url_https/);
    expect(await as(RUNNER, "select public.runner_set_relay_url('https://relay.example/mcp') as ok")).toEqual([{ ok: true }]);
    expect(await as(OWNER, "select * from public.my_cloud_runner()")).toEqual([{ email: "runner@example.com", accepted: true, relay_url: "https://relay.example/mcp" }]);
    await expect(as(null, "select public.runner_set_relay_url(null)")).rejects.toThrow(/permission denied/);
    expect(await as(RUNNER, "select public.runner_set_relay_url(null) as ok")).toEqual([{ ok: true }]);
    expect((await as(OWNER, "select relay_url from public.my_cloud_runner()"))[0]).toEqual({ relay_url: null });
  });
});
