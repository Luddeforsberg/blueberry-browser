import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defined } from "../src/shared/testing";

// Starts sent again and relay grants taken up on exchange, in real Postgres as Supabase's roles, on top of every
// migration before them, as the live database gets them.
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const THIS = "20261121000000_cloud_confirmed.sql";
const BEFORE = readdirSync(join(__dirname, "migrations"))
  .filter((file) => file.endsWith(".sql") && file < THIS)
  .sort();
const MASCOT = `'{"id":"berry","name":"Berry"}'::jsonb`;

describe("what the cloud only takes from an answer", () => {
  let db: PGlite;
  const run = (file: string) => db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
  const as = async <T = Record<string, unknown>>(uid: string, sql: string): Promise<T[]> => {
    await db.exec(`set test.uid = '${uid}'; set role authenticated;`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const one = async (uid: string, sql: string) => Object.values(defined((await as(uid, sql))[0]))[0];
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
  const start = (uid: string, id: string, conversation: string, after: string | null = null) =>
    one(
      uid,
      `select public.start_cloud_job('Buy it', '[]', ${MASCOT}, 'risky', null, '${conversation}', ${after ? `'${after}'` : "null"}, '${id}')`,
    );
  const jobs = async (owner: string) =>
    defined((await db.query<{ n: number }>("select count(*)::int as n from public.cloud_jobs where owner = $1", [owner])).rows[0]).n;

  let ALICE = "";
  let RUNNER = "";
  let OLD_GRANT = "";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of BEFORE) await run(file);
    [ALICE, RUNNER] = [await newUser(), await newUser()];
    await link(ALICE, RUNNER);
    // Made the old way, before this migration, and in use.
    OLD_GRANT = String(await one(ALICE, "select public.create_relay_grant()"));
    await run(THIS);
  });
  afterAll(() => db.close());

  it("gives back the job a start made when it's sent again, whatever has happened since, and only to its owner", async () => {
    const id = randomUUID();
    const conversation = randomUUID();
    expect(await start(ALICE, id, conversation)).toBe(id);
    // Sent again while it's going, which a new message would be refused for, and with the account at its limit.
    for (let n = 0; n < 4; n++) await start(ALICE, randomUUID(), randomUUID());
    expect(await start(ALICE, id, conversation)).toBe(id);
    expect(await jobs(ALICE)).toBe(5);
    await expect(start(ALICE, randomUUID(), randomUUID())).rejects.toThrow(/Too many/);
    // Someone else can't take it, or learn anything from it.
    const bob = await newUser();
    await link(bob, await newUser());
    await expect(start(bob, id, randomUUID())).rejects.toThrow(/Not a job of yours/);
    // Nor join her conversation by starting one under its id.
    const joining = `select public.start_cloud_job('Mine now', '[]', ${MASCOT}, 'risky', null, null, null, '${conversation}')`;
    await expect(as(bob, joining)).rejects.toThrow(/a conversation's/);
    expect(await jobs(bob)).toBe(0);
  });

  it("still starts a job for a sender with no id of its own, as the phone page is", async () => {
    await db.query("update public.cloud_jobs set status = 'done' where owner = $1", [ALICE]);
    const made = await one(ALICE, `select public.start_cloud_job('From the phone', '[]', ${MASCOT}, 'risky', null)`);
    expect(String(made)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps grants made before it working, and running it again takes up none waiting now", async () => {
    expect(await as(RUNNER, `select id from public.relay_mascots('${OLD_GRANT}')`)).toEqual([]);
    const waiting = String(await one(ALICE, "select public.create_relay_grant()"));
    await run(THIS);
    await expect(as(RUNNER, `select id from public.relay_mascots('${waiting}')`)).rejects.toThrow(/Not a grant of this runner/);
    expect(await one(RUNNER, `select public.relay_activate_grant('${waiting}')`)).toBe(true);
    expect(await as(RUNNER, `select id from public.relay_mascots('${waiting}')`)).toEqual([]);
    // And the start still has one signature, so no call is ambiguous.
    expect(await start(ALICE, randomUUID(), randomUUID())).toBeTruthy();
  });
});
