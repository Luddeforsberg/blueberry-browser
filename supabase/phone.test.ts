import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The phone page's tables, in real Postgres as Supabase's roles, on top of the cloud jobs' migration.
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const SCOUT = { id: "m-1", name: "Scout", palette: "robin", accessory: "cap", instructions: "Find cables.", sites: ["webhallen.com"], tools: ["visit", "click"], from_gallery: false };
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";
const KEYS = `'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg'`;

describe("the phone page's database rules", () => {
  let db: PGlite;
  const as = async <T = Record<string, unknown>>(uid: string | null, sql: string): Promise<T[]> => {
    await db.exec(`set test.uid = '${uid ?? ""}'; set role ${uid ? "authenticated" : "anon"};`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  let users = 0;
  const newUser = async () => {
    const id = `00000000-0000-4000-8000-${String(++users).padStart(12, "0")}`;
    await db.query("insert into auth.users values ($1, $2)", [id, `user${users}@example.com`]);
    return id;
  };
  const link = async (owner: string, runner: string) => {
    await as(owner, `select public.link_cloud_runner('${`user${Number(runner.slice(-12))}@example.com`}')`);
    await as(runner, `select public.accept_cloud_runner_link('${`user${Number(owner.slice(-12))}@example.com`}')`);
  };
  const sync = (uid: string | null, birds: unknown) => as(uid, `select public.sync_cloud_flock('${JSON.stringify(birds)}'::jsonb) as kept`);
  const subscribe = (uid: string | null, endpoint = ENDPOINT) => as(uid, `select public.save_push_subscription('${endpoint}', ${KEYS}) as ok`);

  let ALICE = "";
  let RUNNER = "";
  let BOB = "";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    await db.exec(readFileSync(join(__dirname, "migrations/20261102000000_cloud_jobs.sql"), "utf8"));
    await db.exec(readFileSync(join(__dirname, "migrations/20261103000000_phone.sql"), "utf8"));
    ALICE = await newUser();
    RUNNER = await newUser();
    BOB = await newUser();
    await link(ALICE, RUNNER);
  });
  afterAll(() => db.close());

  it("keeps each flock to its owner, replaced whole on every sync", async () => {
    expect(await sync(ALICE, [SCOUT, { ...SCOUT, id: "m-2", name: "Penny" }])).toEqual([{ kept: 2 }]);
    expect(await sync(ALICE, [SCOUT])).toEqual([{ kept: 1 }]);
    expect(await as(ALICE, "select id, name, position, sites, tools from public.cloud_flock")).toEqual([
      { id: "m-1", name: "Scout", position: 0, sites: ["webhallen.com"], tools: ["visit", "click"] },
    ]);
    // Nobody else reads it: not another user, not her runner, not anyone signed out.
    expect(await as(BOB, "select id from public.cloud_flock")).toEqual([]);
    expect(await as(RUNNER, "select id from public.cloud_flock")).toEqual([]);
    await expect(as(null, "select id from public.cloud_flock")).rejects.toThrow(/permission denied/);
    // Only through the function, which a runner can't use.
    await expect(as(ALICE, `insert into public.cloud_flock (id, position, name, palette, accessory, instructions) values ('x', 0, 'X', 'robin', 'cap', 'Y')`)).rejects.toThrow(/permission denied/);
    await expect(sync(RUNNER, [SCOUT])).rejects.toThrow(/runner has no flock/);
    await expect(sync(null, [SCOUT])).rejects.toThrow(/permission denied/);
    // Bob's sync never touches hers.
    await sync(BOB, []);
    expect(await as(ALICE, "select id from public.cloud_flock")).toEqual([{ id: "m-1" }]);
  });

  it("refuses a bird that couldn't have come from the app", async () => {
    await expect(sync(ALICE, [{ ...SCOUT, tools: ["visit", "pay"] }])).rejects.toThrow(/tools_shape/);
    await expect(sync(ALICE, [{ ...SCOUT, id: "berry" }])).rejects.toThrow(/id_shape/);
    await expect(sync(ALICE, [{ ...SCOUT, palette: "red" }])).rejects.toThrow(/look_shape/);
    await expect(sync(ALICE, [{ ...SCOUT, name: "" }])).rejects.toThrow(/name_shape/);
    // A refused sync leaves the last one.
    expect(await as(ALICE, "select id from public.cloud_flock")).toEqual([{ id: "m-1" }]);
  });

  it("gives the runner its own owner's push addresses only, and nothing else of them", async () => {
    expect(await subscribe(ALICE)).toEqual([{ ok: true }]);
    expect(await subscribe(BOB, "https://web.push.apple.com/bobs")).toEqual([{ ok: true }]);
    expect(await as(RUNNER, "select endpoint from public.runner_push_subscriptions()")).toEqual([{ endpoint: ENDPOINT }]);
    // Not by reading the table, and not as anyone but a linked runner.
    await expect(as(ALICE, "select * from public.cloud_push_subscriptions")).rejects.toThrow(/permission denied/);
    await expect(as(RUNNER, "select * from public.cloud_push_subscriptions")).rejects.toThrow(/permission denied/);
    await expect(as(BOB, "select * from public.runner_push_subscriptions()")).rejects.toThrow(/Not a linked runner/);
    // A runner can't be notified itself, and can only drop its owner's.
    await expect(subscribe(RUNNER, "https://fcm.googleapis.com/fcm/send/runner")).rejects.toThrow(/can't be notified/);
    expect(await as(RUNNER, "select public.runner_forget_push_subscription('https://web.push.apple.com/bobs') as ok")).toEqual([{ ok: false }]);
    expect(await as(RUNNER, `select public.runner_forget_push_subscription('${ENDPOINT}') as ok`)).toEqual([{ ok: true }]);
    expect(await as(RUNNER, "select endpoint from public.runner_push_subscriptions()")).toEqual([]);
  });

  it("only keeps an https address, and lets the owner turn it off", async () => {
    await expect(subscribe(ALICE, "http://10.0.0.1/push")).rejects.toThrow(/endpoint_shape/);
    await expect(subscribe(null)).rejects.toThrow(/permission denied/);
    expect(await subscribe(ALICE)).toEqual([{ ok: true }]);
    expect(await as(BOB, `select public.forget_push_subscription('${ENDPOINT}') as ok`)).toEqual([{ ok: false }]);
    expect(await as(ALICE, `select public.forget_push_subscription('${ENDPOINT}') as ok`)).toEqual([{ ok: true }]);
  });
});
