import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// The real migration in real Postgres (compiled to WebAssembly), as the roles Supabase uses, with the runner's own role.
// Only `auth` and the API's `authenticator` are stand-ins.
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create role authenticator nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const MASCOT = `'{"id":"berry","name":"Berry"}'::jsonb`;

type Role = "anon" | "authenticated" | "blueberry_runner";

describe("the cloud jobs' database rules", () => {
  let db: PGlite;

  // As a client of the API: one role, one user from the token, and the error a client would get.
  const as = async <T = Record<string, unknown>>(role: Role, uid: string | null, sql: string): Promise<T[]> => {
    await db.exec(`set test.uid = '${uid ?? ""}'; set role ${role};`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const user = (uid: string, sql: string) => as("authenticated", uid, sql);
  const runner = (uid: string, sql: string) => as("blueberry_runner", uid, sql);
  const start = async (uid: string, prompt = "Order the thing") =>
    (await user(uid, `select public.start_cloud_job('${prompt}', '[]', ${MASCOT}, 'risky', null) as id`))[0].id as string;
  const claim = async (uid: string) => (await runner(uid, "select id, status, prompt from public.runner_claim_job()")) as { id: string; status: string; prompt: string }[];
  const job = async (id: string) => (await db.query<{ status: string; stop_requested: boolean; steps: unknown; live_view_url: string | null }>("select * from public.cloud_jobs where id = $1", [id])).rows[0];
  const ask = async (uid: string, jobId: string, kind = "approval") =>
    (await runner(uid, `select public.runner_ask('${jobId}', '${kind}', 'Click the button “Place order” on shop.example') as id`))[0].id as string;
  const decide = (role: Role, uid: string | null, approval: string, allow = true) =>
    as<{ decided: boolean }>(role, uid, `select public.decide_cloud_approval('${approval}', ${allow}) as decided`);
  const decision = async (uid: string, approval: string) => (await runner(uid, `select * from public.runner_decision('${approval}')`))[0];

  // Each test has its own two users, so one test's queue isn't another's.
  let ALICE = "";
  let BOB = "";
  let users = 0;
  const newUser = async () => {
    const id = `00000000-0000-4000-8000-${String(++users).padStart(12, "0")}`;
    await db.query("insert into auth.users values ($1)", [id]);
    return id;
  };
  beforeEach(async () => {
    ALICE = await newUser();
    BOB = await newUser();
  });

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    await db.exec(readFileSync(join(__dirname, "migrations/20261102000000_cloud_jobs.sql"), "utf8"));
  });
  afterAll(() => db.close());

  it("claims each queued job once, oldest first, and only the token's user's", async () => {
    const first = await start(ALICE, "First");
    const second = await start(ALICE, "Second");
    const bobs = await start(BOB, "Bobs");
    expect(await claim(ALICE)).toEqual([{ id: first, status: "running", prompt: "First" }]);
    expect((await claim(ALICE)).map(({ id }) => id)).toEqual([second]);
    expect(await claim(ALICE)).toEqual([]);
    // Bob's job is out of reach of Alice's runner, even to read.
    expect(await runner(ALICE, `select id from public.cloud_jobs where id = '${bobs}'`)).toEqual([]);
    expect(await runner(ALICE, `select public.runner_update_job('${bobs}', 'done') as stop`)).toEqual([{ stop: true }]);
    expect((await job(bobs)).status).toBe("queued");
    expect((await claim(BOB)).map(({ id }) => id)).toEqual([bobs]);
  });

  it("ends a job whose runner went quiet as failed, rather than running it again", async () => {
    const id = await start(ALICE);
    await claim(ALICE);
    await db.query("update public.cloud_jobs set heartbeat_at = now() - interval '3 minutes' where id = $1", [id]);
    expect(await claim(ALICE)).toEqual([]);
    expect((await job(id)).status).toBe("failed");
  });

  it("lets the runner write what happened, and ask, but never decide", async () => {
    const id = await start(ALICE);
    await claim(ALICE);
    expect(await runner(ALICE, `select public.runner_update_job('${id}', p_steps => '[{"text":"Opened shop.example","done":true}]', p_live_view => 'https://www.browserbase.com/devtools-fullscreen/inspector.html') as stop`)).toEqual([{ stop: false }]);
    expect((await job(id)).steps).toEqual([{ text: "Opened shop.example", done: true }]);
    const approval = await ask(ALICE, id);
    expect((await job(id)).status).toBe("waiting");
    expect(await decision(ALICE, approval)).toEqual({ decision: null, answer: null });

    // Not through the function, not by writing the column, and not by asking with the answer already in.
    await expect(decide("blueberry_runner", ALICE, approval)).rejects.toThrow(/permission denied/);
    await expect(runner(ALICE, `update public.cloud_approvals set decision = 'allow' where id = '${approval}'`)).rejects.toThrow(/permission denied/);
    await expect(runner(ALICE, `insert into public.cloud_approvals (job_id, owner, kind, text, decision) values ('${id}', '${ALICE}', 'approval', 'Anything', 'allow')`)).rejects.toThrow(/permission denied/);
    await expect(runner(ALICE, `select public.start_cloud_job('More', '[]', ${MASCOT}, 'never', null)`)).rejects.toThrow(/permission denied/);
    await expect(runner(ALICE, `update public.cloud_jobs set action_approval = 'never' where id = '${id}'`)).rejects.toThrow(/permission denied/);
    // Nor anyone signed out, nor another user.
    await expect(decide("anon", null, approval)).rejects.toThrow(/permission denied/);
    expect(await decide("authenticated", BOB, approval)).toEqual([{ decided: false }]);
    expect(await decision(ALICE, approval)).toEqual({ decision: null, answer: null });

    expect(await decide("authenticated", ALICE, approval)).toEqual([{ decided: true }]);
    expect(await decision(ALICE, approval)).toEqual({ decision: "allow", answer: null });
    // Once only.
    expect(await decide("authenticated", ALICE, approval, false)).toEqual([{ decided: false }]);
    expect(await decision(ALICE, approval)).toEqual({ decision: "allow", answer: null });
  });

  it("takes an answer only for a question, and nothing once the job has stopped waiting", async () => {
    const id = await start(ALICE);
    await claim(ALICE);
    const question = await ask(ALICE, id, "question");
    expect(await user(ALICE, `select public.decide_cloud_approval('${question}', true, '  Blue  ') as decided`)).toEqual([{ decided: true }]);
    expect(await decision(ALICE, question)).toEqual({ decision: "allow", answer: "Blue" });

    await runner(ALICE, `select public.runner_update_job('${id}', 'running')`);
    const late = await ask(ALICE, id);
    // No answer came in time, so the runner stopped it, and the old card can't allow anything now.
    await runner(ALICE, `select public.runner_update_job('${id}', 'stopped', p_error => 'Nobody answered in time.')`);
    expect(await decide("authenticated", ALICE, late)).toEqual([{ decided: false }]);
    expect((await job(id)).live_view_url).toBeNull();
    expect(await runner(ALICE, `select public.runner_update_job('${id}', 'running') as stop`)).toEqual([{ stop: true }]);
    expect((await job(id)).status).toBe("stopped");
  });

  it("keeps users to their own rows and to what they asked for", async () => {
    const id = await start(ALICE);
    expect(await user(BOB, `select id from public.cloud_jobs where id = '${id}'`)).toEqual([]);
    expect(await user(BOB, `select id from public.my_cloud_jobs(array['${id}'::uuid])`)).toEqual([]);
    expect(await user(BOB, `select public.stop_cloud_job('${id}') as stopped`)).toEqual([{ stopped: false }]);
    expect(await user(BOB, `select public.forget_cloud_job('${id}') as gone`)).toEqual([{ gone: false }]);
    // A user can't write what the runner did, or ask themselves something.
    for (const set of ["status = 'done'", "reply = 'Done'", `owner = '${BOB}'`, "live_view_url = 'https://www.browserbase.com/x'"]) {
      await expect(user(ALICE, `update public.cloud_jobs set ${set} where id = '${id}'`)).rejects.toThrow(/permission denied/);
    }
    await expect(user(ALICE, `insert into public.cloud_approvals (job_id, owner, kind, text) values ('${id}', '${ALICE}', 'approval', 'x')`)).rejects.toThrow(/permission denied/);
    await expect(user(ALICE, "select * from public.runner_claim_job()")).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, "select * from public.cloud_jobs")).rejects.toThrow(/permission denied/);
    // A live view that isn't Browserbase's can't be stored at all.
    await claim(ALICE);
    await expect(runner(ALICE, `select public.runner_update_job('${id}', p_live_view => 'https://evil.example/browserbase.com/')`)).rejects.toThrow(/live_view_shape/);

    expect(await user(ALICE, `select public.stop_cloud_job('${id}') as stopped`)).toEqual([{ stopped: true }]);
    expect((await job(id)).stop_requested).toBe(true);
    expect(await runner(ALICE, `select public.runner_update_job('${id}') as stop`)).toEqual([{ stop: true }]);
    expect(await user(ALICE, `select public.forget_cloud_job('${id}') as gone`)).toEqual([{ gone: true }]);
    expect(await job(id)).toBeUndefined();
  });

  it("stops a queued job at once, and lets an account have five going at a time, made only through the function", async () => {
    const CAROL = await newUser();
    const first = await start(CAROL);
    expect(await user(CAROL, `select public.stop_cloud_job('${first}') as stopped`)).toEqual([{ stopped: true }]);
    expect((await job(first)).status).toBe("stopped");
    for (let at = 0; at < 5; at++) await start(CAROL);
    await expect(start(CAROL)).rejects.toThrow(/Too many/);
    // Not by writing the row straight in either, and not signed out.
    await expect(user(CAROL, `insert into public.cloud_jobs (prompt, mascot) values ('More', ${MASCOT})`)).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, `select public.start_cloud_job('More', '[]', ${MASCOT}, 'risky', null)`)).rejects.toThrow(/permission denied/);
    expect(await user(CAROL, "select count(*)::int as n from public.cloud_jobs where status = 'queued'")).toEqual([{ n: 5 }]);
  });
});
