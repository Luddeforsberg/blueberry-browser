import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defined } from "../src/shared/testing";

// The turns of a conversation's jobs, in real Postgres as Supabase's roles, on top of every migration before them, as
// the live database gets them.
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const THIS = "20261123000000_job_turns.sql";
const BEFORE = readdirSync(join(__dirname, "migrations"))
  .filter((file) => file.endsWith(".sql") && file < THIS)
  .sort();
const MASCOT = `'{"id":"berry","name":"Berry"}'::jsonb`;
// Ids that put the older of two jobs made in the same instant last, which is how the old rule took it as newest.
const HIGH = (n: number) => `ffffffff-ffff-4fff-8fff-${String(n).padStart(12, "0")}`;
const LOW = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "f")}`;

describe("which job of a conversation is newest", () => {
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
  const start = async (uid: string, id: string, conversation: string, after: string | null) =>
    defined(
      (
        await as<{ id: string }>(
          uid,
          `select public.start_cloud_job('Go on', '[]', ${MASCOT}, 'risky', null, '${conversation}', ${after ? `'${after}'` : "null"}, '${id}') as id`,
        )
      )[0],
    ).id;
  // Written around the function, as only a test can: a finished job made at a given time.
  const made = (owner: string, id: string, conversation: string | null, at: string) =>
    db.query(
      "insert into public.cloud_jobs (id, owner, prompt, mascot, conversation_id, status, created_at) values ($1, $2, 'Old', $3::jsonb, $4, 'done', $5)",
      [id, owner, '{"id":"berry","name":"Berry"}', conversation, at],
    );
  const finish = (id: string) => db.query("update public.cloud_jobs set status = 'done' where id = $1", [id]);
  const turns = async (conversation: string) =>
    (
      await db.query<{ id: string; turn: number }>(
        "select id, turn from public.cloud_jobs where conversation_id = $1 or id = $1 order by turn",
        [conversation],
      )
    ).rows.map(({ id, turn }) => [id, turn]);

  let ALICE = "";
  const MANY = randomUUID();
  const TIED = HIGH(1);
  const LEGACY = randomUUID();
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of BEFORE) await run(file);
    ALICE = await newUser();
    await link(ALICE, await newUser());
    // From before turns: a long conversation made out of order, two of its jobs in the same instant, and a job from
    // before conversations.
    for (let n = 12; n >= 1; n--)
      await made(ALICE, n === 1 ? MANY : randomUUID(), MANY, `2026-11-0${n < 10 ? 1 : 2}T10:00:${String(n).padStart(2, "0")}Z`);
    await made(ALICE, TIED, TIED, "2026-11-03T10:00:00Z");
    await made(ALICE, LOW(1), TIED, "2026-11-03T10:00:00Z");
    await made(ALICE, LEGACY, null, "2026-11-01T09:00:00Z");
    await run(THIS);
  });
  afterAll(() => db.close());

  it("gives jobs already there their turns in the order they were made, the newest the one the old rule took", async () => {
    const many = await turns(MANY);
    expect(many.map(([, turn]) => turn)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    const byTime = (
      await db.query<{ id: string }>("select id from public.cloud_jobs where conversation_id = $1 order by created_at, id", [MANY])
    ).rows.map(({ id }) => id);
    expect(many.map(([id]) => id)).toEqual(byTime);
    // A tie went to the higher id, and still does, so a follow-up built on it before this goes on being taken.
    expect(await turns(TIED)).toEqual([
      [LOW(1), 1],
      [TIED, 2],
    ]);
    await expect(start(ALICE, randomUUID(), TIED, LOW(1))).rejects.toThrow(/went on since that job/);
    const next = await start(ALICE, randomUUID(), TIED, TIED);
    expect((await turns(TIED)).at(-1)).toEqual([next, 3]);
    await finish(next);
    // A job from before conversations is the first of the one that follows it up.
    const after = await start(ALICE, randomUUID(), LEGACY, LEGACY);
    expect(await turns(LEGACY)).toEqual([
      [LEGACY, 1],
      [after, 2],
    ]);
    await finish(after);
  });

  it("takes a follow-up only on the job made last, even when two were made in the same instant", async () => {
    const first = HIGH(2);
    expect(await start(ALICE, first, first, null)).toBe(first);
    await finish(first);
    const second = await start(ALICE, LOW(2), first, first);
    await finish(second);
    // The clock says the same for both, or puts the second first, and the older still has the higher id.
    for (const at of ["2026-11-04T10:00:00Z", "2026-11-04T09:00:00Z"]) {
      await db.query(
        "update public.cloud_jobs set created_at = case when id = $1 then '2026-11-04T10:00:00Z' else $3::timestamptz end where id in ($1, $2)",
        [first, second, at],
      );
      await expect(start(ALICE, randomUUID(), first, first)).rejects.toThrow(/went on since that job/);
    }
    const third = await start(ALICE, randomUUID(), first, second);
    expect(await turns(first)).toEqual([
      [first, 1],
      [second, 2],
      [third, 3],
    ]);
  });

  it("refuses a second job at the same turn of a conversation, even written around the function", async () => {
    const first = await start(ALICE, randomUUID(), randomUUID(), null);
    const { conversation_id: conversation } = defined(
      (await db.query<{ conversation_id: string }>("select conversation_id from public.cloud_jobs where id = $1", [first])).rows[0],
    );
    await finish(first);
    await expect(made(ALICE, randomUUID(), conversation, "2026-11-05T10:00:00Z")).rejects.toThrow(/cloud_jobs_turn/);
  });

  it("can be run again over itself, and leaves every turn as it was", async () => {
    const before = await turns(MANY);
    await run(THIS);
    expect(await turns(MANY)).toEqual(before);
    // And the start still has one signature, so no call is ambiguous.
    const fresh = randomUUID();
    expect(await start(ALICE, fresh, fresh, null)).toBe(fresh);
    expect(await turns(fresh)).toEqual([[fresh, 1]]);
  });
});
