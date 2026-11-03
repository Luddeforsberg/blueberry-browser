import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Relay jobs on the owner's Mac, in real Postgres as Supabase's roles, on top of every migration before it.
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const MIGRATIONS = [
  "20261102000000_cloud_jobs.sql",
  "20261103000000_phone.sql",
  "20261104000000_cloud_conversations.sql",
  "20261105000000_cloud_routines.sql",
  "20261106000000_cloud_relay.sql",
  "20261107000000_relay_on_mac.sql",
];

const MASCOT = `'{"id":"berry","name":"Berry","sites":[],"tools":["visit","click","type"]}'::jsonb`;

describe("relay jobs on the Mac", () => {
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
  const start = async (secret: string, where: string) => {
    const id = await one(RUNNER, `select public.relay_start_job('${secret}', 'Find tea', ${MASCOT}, '${where}')`);
    return id === null ? null : String(id);
  };
  const targetOf = async (job: string) => (await db.query<{ target: string }>("select target from public.cloud_jobs where id = $1", [job])).rows[0]?.target;

  let ALICE = "";
  let RUNNER = "";
  let BOB = "";
  let SECRET = "";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of MIGRATIONS) await db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
  });
  beforeEach(async () => {
    [ALICE, RUNNER, BOB] = [await newUser(), await newUser(), await newUser()];
    await link(ALICE, RUNNER);
    SECRET = String(await one(ALICE, "select public.create_relay_grant()"));
  });
  afterAll(() => db.close());

  it("goes to the Mac only while it's allowed and seen, and refuses `mac` without it", async () => {
    expect(await start(SECRET, "mac")).toBeNull();
    expect(await targetOf((await start(SECRET, "auto"))!)).toBe("cloud");
    expect(await one(ALICE, "select public.mac_presence(true)")).toBe(true);
    expect(await targetOf((await start(SECRET, "auto"))!)).toBe("mac");
    expect(await targetOf((await start(SECRET, "mac"))!)).toBe("mac");
    expect(await targetOf((await start(SECRET, "cloud"))!)).toBe("cloud");
    await expect(start(SECRET, "elsewhere")).rejects.toThrow(/auto, mac or cloud/);
    // Seen too long ago counts as gone.
    await db.query("update public.cloud_mac_presence set last_seen = now() - interval '2 minutes' where owner = $1", [ALICE]);
    expect(await start(SECRET, "mac")).toBeNull();
    // Off, and what was waiting for the Mac ends.
    await one(ALICE, "select public.mac_presence(true)");
    const waiting = (await start(SECRET, "mac"))!;
    expect(await one(ALICE, "select public.mac_presence(false)")).toBe(false);
    expect((await db.query("select status from public.cloud_jobs where id = $1", [waiting])).rows).toEqual([{ status: "failed" }]);
    expect(await start(SECRET, "mac")).toBeNull();
    expect((await as(RUNNER, `select target from public.relay_jobs('${SECRET}', array['${waiting}']::uuid[])`))[0]).toEqual({ target: "mac" });
  });

  it("is never claimed, read or written by the runner", async () => {
    await one(ALICE, "select public.mac_presence(true)");
    const job = (await start(SECRET, "mac"))!;
    expect(await as(RUNNER, "select id from public.runner_claim_job()")).toEqual([]);
    expect(await as(RUNNER, "select id from public.cloud_jobs")).toEqual([]);
    expect(await one(RUNNER, `select public.runner_update_job('${job}', 'done', null, 'Hijacked')`)).toBe(true);
    await expect(as(RUNNER, "select * from public.mac_claim_job()")).rejects.toThrow(/A runner isn't a Mac/);
    await expect(as(RUNNER, "select public.mac_presence(true)")).rejects.toThrow(/A runner isn't a Mac/);
    // Claimed by the owner, the runner still can't write it or ask on it.
    expect((await as<{ id: string }>(ALICE, "select id from public.mac_claim_job()")).map(({ id }) => id)).toEqual([job]);
    expect(await one(RUNNER, `select public.runner_update_job('${job}', 'done', null, 'Hijacked')`)).toBe(true);
    await expect(as(RUNNER, `select public.runner_ask('${job}', 'approval', 'Buy it')`)).rejects.toThrow(/Not a job it's running/);
    expect((await db.query("select status, reply from public.cloud_jobs where id = $1", [job])).rows).toEqual([{ status: "running", reply: "" }]);
  });

  it("is claimed only by its owner, with the switch on, once", async () => {
    await one(ALICE, "select public.mac_presence(true)");
    const job = (await start(SECRET, "mac"))!;
    // Someone else, even with their own switch on, gets nothing of it.
    await one(BOB, "select public.mac_presence(true)");
    expect(await as(BOB, "select id from public.mac_claim_job()")).toEqual([]);
    expect(await one(BOB, `select public.mac_update_job('${job}', 'done', null, 'Hijacked')`)).toBe(true);
    await expect(as(null, "select * from public.mac_claim_job()")).rejects.toThrow();
    // The owner with the switch off here, as a stale app would be, takes nothing either.
    await db.query("update public.cloud_mac_presence set enabled = false where owner = $1", [ALICE]);
    expect(await as(ALICE, "select id from public.mac_claim_job()")).toEqual([]);
    expect((await db.query("select status from public.cloud_jobs where id = $1", [job])).rows).toEqual([{ status: "queued" }]);
    await db.query("update public.cloud_mac_presence set enabled = true where owner = $1", [ALICE]);
    expect((await as<{ id: string }>(ALICE, "select id from public.mac_claim_job()")).map(({ id }) => id)).toEqual([job]);
    expect(await as(ALICE, "select id from public.mac_claim_job()")).toEqual([]);
    // It writes back, and a Stop from the relay reaches it.
    expect(await one(ALICE, `select public.mac_update_job('${job}', null, '[{"text":"Looking","done":false}]'::jsonb, 'Half')`)).toBe(false);
    expect(await one(RUNNER, `select public.relay_stop_job('${SECRET}', '${job}')`)).toBe(true);
    expect(await one(ALICE, `select public.mac_update_job('${job}')`)).toBe(true);
    await one(ALICE, `select public.mac_update_job('${job}', 'stopped', null, 'Found tea')`);
    expect((await as(RUNNER, `select status, reply, steps from public.relay_jobs('${SECRET}', array['${job}']::uuid[])`))[0]).toEqual({ status: "stopped", reply: "Found tea", steps: [{ text: "Looking", done: false }] });
    // Over, nothing more is written.
    expect(await one(ALICE, `select public.mac_update_job('${job}', 'done', null, 'Again')`)).toBe(true);
    expect((await db.query("select status from public.cloud_jobs where id = $1", [job])).rows).toEqual([{ status: "stopped" }]);
  });

  it("ends a job whose app went quiet, or that waited too long, rather than running it again", async () => {
    await one(ALICE, "select public.mac_presence(true)");
    const quiet = (await start(SECRET, "mac"))!;
    await as(ALICE, "select id from public.mac_claim_job()");
    const late = (await start(SECRET, "mac"))!;
    await db.query("update public.cloud_jobs set heartbeat_at = now() - interval '3 minutes' where id = $1", [quiet]);
    await db.query("update public.cloud_jobs set created_at = now() - interval '6 minutes' where id = $1", [late]);
    expect(await as(ALICE, "select id from public.mac_claim_job()")).toEqual([]);
    expect((await db.query("select status from public.cloud_jobs where id = any($1) order by created_at", [[quiet, late]])).rows).toEqual([{ status: "failed" }, { status: "failed" }]);
  });

  it("ends Mac jobs that can't go on while the Mac is off, so they never hold up the cloud", async () => {
    await one(ALICE, "select public.mac_presence(true)");
    const stale: string[] = [];
    for (let n = 0; n < 5; n++) stale.push((await start(SECRET, "mac"))!);
    await as(ALICE, "select id from public.mac_claim_job()");
    // The Mac goes away without saying so, as when it sleeps, and nothing of it calls again.
    await db.query("update public.cloud_mac_presence set last_seen = now() - interval '1 hour' where owner = $1", [ALICE]);
    await db.query("update public.cloud_jobs set created_at = now() - interval '6 minutes', heartbeat_at = now() - interval '3 minutes' where id = any($1)", [stale]);
    // The relay's next job goes to the cloud rather than being refused as one too many.
    expect(await targetOf((await start(SECRET, "auto"))!)).toBe("cloud");
    expect((await as<{ status: string }>(RUNNER, `select status from public.relay_jobs('${SECRET}', array['${stale.join("','")}']::uuid[])`)).map(({ status }) => status)).toEqual(Array(5).fill("failed"));

    // The runner's claim ends them too, with nothing from the relay.
    const more: string[] = [];
    await db.query("update public.cloud_mac_presence set last_seen = now() where owner = $1", [ALICE]);
    for (let n = 0; n < 4; n++) more.push((await start(SECRET, "mac"))!);
    await db.query("update public.cloud_jobs set created_at = now() - interval '6 minutes' where id = any($1)", [more]);
    expect((await as<{ id: string }>(RUNNER, "select id from public.runner_claim_job()")).length).toBe(1);
    expect((await db.query<{ status: string }>("select status from public.cloud_jobs where id = any($1)", [more])).rows.map(({ status }) => status)).toEqual(Array(4).fill("failed"));
    // Nor did the runner get to read them.
    expect(await as(RUNNER, "select id from public.cloud_jobs where target = 'mac'")).toEqual([]);
  });

  it("keeps the presence table to the functions", async () => {
    await expect(as(ALICE, "select * from public.cloud_mac_presence")).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, "select public.mac_available(gen_random_uuid())")).rejects.toThrow(/permission denied/);
  });
});
