import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Routines that run with the Mac off, in real Postgres as Supabase's roles, on top of every migration before them.
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
const SCHEDULE = `'{"kind":"daily","time":"08:00"}'::jsonb`;

describe("routines in the cloud", () => {
  let db: PGlite;
  const as = async <T = Record<string, unknown>>(uid: string | null, sql: string): Promise<T[]> => {
    await db.exec(`set test.uid = '${uid ?? ""}'; set role ${uid ? "authenticated" : "anon"};`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const refused = (uid: string | null, sql: string) => as(uid, sql).then(() => "allowed", (error: Error) => error.message);
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
  const sync = (uid: string, key = "routine-1", next = "now() - interval '1 minute'") =>
    as<{ id: string }>(uid, `select public.sync_cloud_routine('${key}', 'Check the prices', ${MASCOT}, 'risky', null, ${SCHEDULE}, 'Europe/Stockholm', ${next}) as id`).then(([row]) => row.id);
  const due = (runner: string) => as<{ id: string; next_run_at: string }>(runner, "select id, next_run_at from public.runner_due_routines()");
  const startRun = async (runner: string, routine: string, dueAt: string, next = "now() + interval '1 day'") =>
    (await as<{ id: string | null }>(runner, `select public.runner_start_routine('${routine}', '${dueAt}', ${next}) as id`))[0].id;
  const dueAt = async (routine: string) => (await db.query<{ at: string }>("select next_run_at::text as at from public.cloud_routines where id = $1", [routine])).rows[0].at;

  let ALICE = "";
  let RUNNER = "";
  let BOB = "";
  let BOBS_RUNNER = "";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of ["20261102000000_cloud_jobs.sql", "20261103000000_phone.sql", "20261104000000_cloud_conversations.sql", "20261105000000_cloud_routines.sql"]) {
      await db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
    }
  });
  beforeEach(async () => {
    ALICE = await newUser();
    RUNNER = await newUser();
    BOB = await newUser();
    BOBS_RUNNER = await newUser();
    await link(ALICE, RUNNER);
    await link(BOB, BOBS_RUNNER);
  });
  afterAll(() => db.close());

  it("is written only by its owner, through the function, and read only by them", async () => {
    const id = await sync(ALICE);
    // Again with the same key replaces it rather than adding one.
    expect(await sync(ALICE)).toBe(id);
    expect(await as(ALICE, "select routine_key from public.cloud_routines")).toEqual([{ routine_key: "routine-1" }]);
    expect(await as(BOB, "select id from public.cloud_routines")).toEqual([]);
    expect(await as(RUNNER, "select id from public.cloud_routines")).toEqual([]);
    expect(await refused(ALICE, `insert into public.cloud_routines (routine_key, prompt, mascot, schedule, time_zone) values ('x', 'y', ${MASCOT}, ${SCHEDULE}, 'UTC')`)).toMatch(/permission denied/);
    expect(await refused(ALICE, `update public.cloud_routines set prompt = 'Something else'`)).toMatch(/permission denied/);
    expect(await refused(RUNNER, `select public.sync_cloud_routine('r', 'Mine', ${MASCOT}, 'risky', null, ${SCHEDULE}, 'UTC', now())`)).toMatch(/A runner can't keep routines/);
    expect(await refused(null, `select public.sync_cloud_routine('r', 'Mine', ${MASCOT}, 'risky', null, ${SCHEDULE}, 'UTC', now())`)).toMatch(/permission denied|Not signed in/);

    // Someone with no runner can't keep one, since nothing would run it.
    const lonely = await newUser();
    expect(await refused(lonely, `select public.sync_cloud_routine('r', 'Mine', ${MASCOT}, 'risky', null, ${SCHEDULE}, 'UTC', now())`)).toMatch(/No runner has accepted/);

    expect(await as(BOB, "select public.forget_cloud_routine('routine-1') as gone")).toEqual([{ gone: false }]);
    expect(await as(ALICE, "select public.forget_cloud_routine('routine-1') as gone")).toEqual([{ gone: true }]);
    expect(await as(ALICE, "select id from public.cloud_routines")).toEqual([]);
  });

  it("shows a runner only its owner's due routines, and only when each is due", async () => {
    const dueNow = await sync(ALICE, "due");
    await sync(ALICE, "later", "now() + interval '1 hour'");
    await sync(ALICE, "paused", "null");
    await sync(BOB, "bobs");
    expect((await due(RUNNER)).map(({ id }) => id)).toEqual([dueNow]);
    expect(await refused(ALICE, "select * from public.runner_due_routines()")).toMatch(/Not a linked runner/);
  });

  it("starts one job for a due run, as the owner's, and moves the routine on", async () => {
    const routine = await sync(ALICE);
    const at = await dueAt(routine);
    const job = await startRun(RUNNER, routine, at);
    expect(job).toBeTruthy();
    const [row] = (await db.query<Record<string, unknown>>("select owner, prompt, mascot, status, routine_id, conversation_id from public.cloud_jobs where id = $1", [job])).rows;
    expect(row).toMatchObject({ owner: ALICE, prompt: "Check the prices", mascot: { id: "berry", name: "Berry" }, status: "queued", routine_id: routine, conversation_id: job });
    // The same run asked for again makes nothing, and it isn't due any more.
    expect(await startRun(RUNNER, routine, at)).toBeNull();
    expect(await due(RUNNER)).toEqual([]);
    // The runner then takes it like any other job.
    expect((await as<{ id: string }>(RUNNER, "select id from public.runner_claim_job()")).map(({ id }) => id)).toEqual([job]);
  });

  it("never starts another owner's routine, one that isn't due, or a run whose next time goes backwards", async () => {
    const bobs = await sync(BOB);
    expect(await startRun(RUNNER, bobs, await dueAt(bobs))).toBeNull();
    const later = await sync(ALICE, "later", "now() + interval '1 hour'");
    expect(await startRun(RUNNER, later, await dueAt(later))).toBeNull();
    const routine = await sync(ALICE);
    expect(await refused(RUNNER, `select public.runner_start_routine('${routine}', '${await dueAt(routine)}', now() - interval '1 day')`)).toMatch(/has to come after/);
    expect(await refused(ALICE, `select public.runner_start_routine('${routine}', '${await dueAt(routine)}', null)`)).toMatch(/Not a linked runner/);
    expect(await db.query("select id from public.cloud_jobs where owner = $1", [ALICE]).then(({ rows }) => rows)).toEqual([]);
  });

  it("skips a run while the last one is still going, and one past the limit of five jobs", async () => {
    const routine = await sync(ALICE);
    expect(await startRun(RUNNER, routine, await dueAt(routine), "now() - interval '30 seconds'")).toBeTruthy();
    // Due again while that job is going: skipped, and on to the next time.
    expect(await startRun(RUNNER, routine, await dueAt(routine), "now() + interval '1 day'")).toBeNull();
    expect(await due(RUNNER)).toEqual([]);

    const busy = await sync(ALICE, "busy");
    await db.query("update public.cloud_jobs set status = 'done' where owner = $1", [ALICE]);
    for (let n = 0; n < 5; n++) await as(ALICE, `select public.start_cloud_job('Job ${n}', '[]', ${MASCOT}, 'risky', null)`);
    expect(await startRun(RUNNER, busy, await dueAt(busy))).toBeNull();
    expect(await db.query("select id from public.cloud_jobs where routine_id = $1", [busy]).then(({ rows }) => rows)).toEqual([]);
  });

  it("keeps the routine out of reach of anyone but the owner once they unlink the runner", async () => {
    const routine = await sync(ALICE);
    await as(ALICE, "select public.unlink_cloud_runner()");
    expect(await refused(RUNNER, "select * from public.runner_due_routines()")).toMatch(/Not a linked runner/);
    expect(await refused(RUNNER, `select public.runner_start_routine('${routine}', now(), null)`)).toMatch(/Not a linked runner/);
  });
});
