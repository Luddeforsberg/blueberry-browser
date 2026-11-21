import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defined } from "../src/shared/testing";

// Which jobs a runner may count as still going, so it ends a session left from one only once that job is over, in real
// Postgres as Supabase's roles.
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
  "20261108000000_runner_approvals_scope.sql",
  "20261122000000_runner_live_jobs.sql",
];

const MASCOT = `'{"id":"berry","name":"Berry"}'::jsonb`;
const NOBODYS = "00000000-0000-4000-8000-999999999999";

describe("the runner's view of which jobs are live", () => {
  let db: PGlite;
  const as = async <T = Record<string, unknown>>(uid: string | null, sql: string): Promise<T[]> => {
    await db.exec(`set test.uid = '${uid ?? ""}'; set role ${uid ? "authenticated" : "anon"};`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const one = async (uid: string | null, sql: string) => Object.values(defined((await as(uid, sql))[0]))[0];
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
  const start = async (owner: string) =>
    String(await one(owner, `select public.start_cloud_job('Order the thing', '[]', ${MASCOT}, 'risky', null)`));
  const claimed = async (owner: string, runner: string) => {
    const job = await start(owner);
    expect(await as(runner, "select id from public.runner_claim_job()")).toEqual([{ id: job }]);
    return job;
  };
  const live = async (uid: string | null, jobs: string[] | null) =>
    (
      await as<{ id: string }>(
        uid,
        `select id from public.runner_live_jobs(${jobs ? `array[${jobs.map((id) => `'${id}'`).join(", ")}]::uuid[]` : "null"}) as id`,
      )
    ).map(({ id }) => id);

  let ALICE = "";
  let RUNNER = "";
  let BOB = "";
  let BOBS_RUNNER = "";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of MIGRATIONS) await db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
    [ALICE, RUNNER, BOB, BOBS_RUNNER] = [await newUser(), await newUser(), await newUser(), await newUser()];
    await link(ALICE, RUNNER);
    await link(BOB, BOBS_RUNNER);
  });
  afterAll(() => db.close());

  it("names only its owner's cloud jobs that are running or waiting, with a heartbeat in the last two minutes", async () => {
    const [running, waiting, done, quiet, mac] = [
      await claimed(ALICE, RUNNER),
      await claimed(ALICE, RUNNER),
      await claimed(ALICE, RUNNER),
      await claimed(ALICE, RUNNER),
      await claimed(ALICE, RUNNER),
    ];
    const bobs = await claimed(BOB, BOBS_RUNNER);
    await as(RUNNER, `select public.runner_ask('${waiting}', 'question', 'Which colour?')`);
    await as(RUNNER, `select public.runner_update_job('${done}', 'done', p_reply => 'Ordered it')`);
    const queued = await start(ALICE);
    // Its runner went quiet, and nothing has ended it yet.
    await db.query("update public.cloud_jobs set heartbeat_at = now() - interval '121 seconds' where id = $1", [quiet]);
    await db.query("update public.cloud_jobs set target = 'mac' where id = $1", [mac]);

    const asked = [running, waiting, done, quiet, mac, queued, bobs, NOBODYS];
    expect(new Set(await live(RUNNER, asked))).toEqual(new Set([running, waiting]));
    expect(await live(BOBS_RUNNER, asked)).toEqual([bobs]);
    expect(await live(RUNNER, [])).toEqual([]);
    expect(await live(RUNNER, null)).toEqual([]);
  });

  it("answers only a linked runner", async () => {
    const job = await claimed(BOB, BOBS_RUNNER);
    await expect(live(BOB, [job])).rejects.toThrow(/Not a linked runner/);
    await expect(live(ALICE, [job])).rejects.toThrow(/Not a linked runner/);
    await expect(live(await newUser(), [job])).rejects.toThrow(/Not a linked runner/);
    await expect(live(null, [job])).rejects.toThrow(/permission denied/);
  });
});
