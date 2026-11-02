import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Conversations of cloud jobs, in real Postgres as Supabase's roles, on top of every migration before it.
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

const MASCOT = `'{"id":"berry","name":"Berry"}'::jsonb`;

describe("conversations of cloud jobs", () => {
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
    await as(owner, `select public.link_cloud_runner('user${Number(runner.slice(-12))}@example.com')`);
    await as(runner, `select public.accept_cloud_runner_link('user${Number(owner.slice(-12))}@example.com')`);
  };
  const start = async (uid: string, conversation: string | null = null, history = "[]") =>
    (await as<{ id: string }>(uid, `select public.start_cloud_job('Go on', '${history}', ${MASCOT}, 'risky', null, ${conversation ? `'${conversation}'` : "null"}) as id`))[0].id;
  const conversationOf = async (id: string) => (await db.query<{ conversation_id: string | null }>("select conversation_id from public.cloud_jobs where id = $1", [id])).rows[0].conversation_id;
  const finish = (id: string, status = "done") => db.query("update public.cloud_jobs set status = $2 where id = $1", [id, status]);

  let ALICE = "";
  let RUNNER = "";
  let BOB = "";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of ["20261102000000_cloud_jobs.sql", "20261103000000_phone.sql", "20261104000000_cloud_conversations.sql"]) {
      await db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
    }
  });
  beforeEach(async () => {
    ALICE = await newUser();
    RUNNER = await newUser();
    BOB = await newUser();
    await link(ALICE, RUNNER);
    await link(BOB, await newUser());
  });
  afterAll(() => db.close());

  it("starts a conversation under the first job's id, or under an id the app chose", async () => {
    const first = await start(ALICE);
    expect(await conversationOf(first)).toBe(first);
    const unused = randomUUID();
    expect(await conversationOf(await start(ALICE, unused))).toBe(unused);
    // The old five-argument call, from an app that hasn't updated, still starts one of its own.
    const old = (await as<{ id: string }>(ALICE, `select public.start_cloud_job('Old', '[]', ${MASCOT}, 'risky', null) as id`))[0].id;
    expect(await conversationOf(old)).toBe(old);
  });

  it("takes a follow-up once the last job is over, with its history, and only one going at a time", async () => {
    const first = await start(ALICE);
    await expect(start(ALICE, first)).rejects.toThrow(/already has a job going/);
    await finish(first);
    const history = JSON.stringify([{ role: "user", content: "Find it" }, { role: "assistant", content: "Found it" }]);
    const second = await start(ALICE, first, history);
    expect(await conversationOf(second)).toBe(first);
    expect((await db.query("select history from public.cloud_jobs where id = $1", [second])).rows[0]).toEqual({ history: JSON.parse(history) });
    await expect(start(ALICE, first)).rejects.toThrow(/already has a job going/);
    // A stopped or failed job is over too.
    await finish(second, "failed");
    expect(await conversationOf(await start(ALICE, first))).toBe(first);
  });

  it("holds one going per conversation even written around the function", async () => {
    const first = await start(ALICE);
    await finish(first);
    await start(ALICE, first);
    await expect(db.query("update public.cloud_jobs set status = 'queued' where id = $1", [first])).rejects.toThrow(/cloud_jobs_one_going/);
  });

  it("never lets anyone follow up someone else's conversation, or the runner start one", async () => {
    const alices = await start(ALICE);
    await finish(alices);
    await expect(start(BOB, alices)).rejects.toThrow(/Not a conversation of yours/);
    await expect(start(RUNNER, alices)).rejects.toThrow(/runner can't start jobs/);
    await expect(as(null, `select public.start_cloud_job('Go on', '[]', ${MASCOT}, 'risky', null, '${alices}')`)).rejects.toThrow(/permission denied/);
    expect((await db.query("select count(*)::int as jobs from public.cloud_jobs where conversation_id = $1", [alices])).rows[0]).toEqual({ jobs: 1 });
  });

  it("brings a job from before conversations into the first one that follows it up", async () => {
    const legacy = await start(ALICE);
    await db.query("update public.cloud_jobs set conversation_id = null, status = 'done' where id = $1", [legacy]);
    const next = await start(ALICE, legacy);
    expect(await conversationOf(legacy)).toBe(legacy);
    expect(await conversationOf(next)).toBe(legacy);
  });

  it("forgets a whole conversation, only the caller's own", async () => {
    const first = await start(ALICE);
    await finish(first);
    await start(ALICE, first);
    const bobs = await start(BOB);
    expect(await as(BOB, `select public.forget_cloud_conversation('${first}') as gone`)).toEqual([{ gone: 0 }]);
    expect(await as(RUNNER, `select public.forget_cloud_conversation('${first}') as gone`)).toEqual([{ gone: 0 }]);
    expect(await as(ALICE, `select public.forget_cloud_conversation('${first}') as gone`)).toEqual([{ gone: 2 }]);
    expect((await db.query("select id from public.cloud_jobs where id = $1", [bobs])).rows).toHaveLength(1);
  });
});
