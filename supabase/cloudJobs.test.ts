import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// The real migration in real Postgres (compiled to WebAssembly), as the roles Supabase uses. The runner is a user like
// any other here, signed in as itself. Only `auth` is a stand-in.
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

describe("the cloud jobs' database rules", () => {
  let db: PGlite;

  // As a client of the API: signed in as one user, or not at all, and the error a client would get.
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
  const emailOf = async (id: string) => (await db.query<{ email: string }>("select email from auth.users where id = $1", [id])).rows[0].email;
  const offer = async (owner: string, runner: string) => (await as<{ ok: boolean }>(owner, `select public.link_cloud_runner('${await emailOf(runner)}') as ok`))[0].ok;
  const accept = async (runner: string, owner: string) => (await as<{ ok: boolean }>(runner, `select public.accept_cloud_runner_link('${await emailOf(owner)}') as ok`))[0].ok;

  // Each test has its own owner, that owner's runner, and another owner.
  let ALICE = "";
  let RUNNER = "";
  let BOB = "";
  beforeEach(async () => {
    ALICE = await newUser();
    RUNNER = await newUser();
    BOB = await newUser();
    expect(await offer(ALICE, RUNNER)).toBe(true);
    expect(await accept(RUNNER, ALICE)).toBe(true);
  });

  const start = async (uid: string, prompt = "Order the thing") =>
    (await as(uid, `select public.start_cloud_job('${prompt}', '[]', ${MASCOT}, 'risky', null) as id`))[0].id as string;
  const claim = async (runner: string) => (await as(runner, "select id, status, prompt from public.runner_claim_job()")) as { id: string; status: string; prompt: string }[];
  const job = async (id: string) => (await db.query<{ status: string; stop_requested: boolean; steps: unknown; live_view_url: string | null }>("select * from public.cloud_jobs where id = $1", [id])).rows[0];
  const ask = async (runner: string, jobId: string, kind = "approval") =>
    (await as(runner, `select public.runner_ask('${jobId}', '${kind}', 'Click the button “Place order” on shop.example') as id`))[0].id as string;
  const decide = (uid: string | null, approval: string, allow = true) => as<{ decided: boolean }>(uid, `select public.decide_cloud_approval('${approval}', ${allow}) as decided`);
  const decision = async (approval: string) => (await db.query("select decision, answer from public.cloud_approvals where id = $1", [approval])).rows[0];

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    await db.exec(readFileSync(join(__dirname, "migrations/20261102000000_cloud_jobs.sql"), "utf8"));
  });
  afterAll(() => db.close());

  it("claims each queued job once, oldest first, and only its own owner's", async () => {
    const first = await start(ALICE, "First");
    const second = await start(ALICE, "Second");
    const bobs = await start(BOB, "Bobs");
    expect(await claim(RUNNER)).toEqual([{ id: first, status: "running", prompt: "First" }]);
    expect((await claim(RUNNER)).map(({ id }) => id)).toEqual([second]);
    expect(await claim(RUNNER)).toEqual([]);
    // Bob's job is out of reach of Alice's runner, even to read.
    expect(await as(RUNNER, `select id from public.cloud_jobs where id = '${bobs}'`)).toEqual([]);
    expect(await as(RUNNER, `select public.runner_update_job('${bobs}', 'done') as stop`)).toEqual([{ stop: true }]);
    expect((await job(bobs)).status).toBe("queued");
  });

  it("ends a job whose runner went quiet as failed, rather than running it again", async () => {
    const id = await start(ALICE);
    await claim(RUNNER);
    await db.query("update public.cloud_jobs set heartbeat_at = now() - interval '3 minutes' where id = $1", [id]);
    expect(await claim(RUNNER)).toEqual([]);
    expect((await job(id)).status).toBe("failed");
    // Once it's over, the runner can't see it any more.
    expect(await as(RUNNER, `select id from public.cloud_jobs where id = '${id}'`)).toEqual([]);
  });

  it("lets the runner write what happened, and ask, but never decide", async () => {
    const id = await start(ALICE);
    await claim(RUNNER);
    expect(await as(RUNNER, `select public.runner_update_job('${id}', p_steps => '[{"text":"Opened shop.example","done":true}]', p_live_view => 'https://www.browserbase.com/devtools-fullscreen/inspector.html') as stop`)).toEqual([{ stop: false }]);
    expect((await job(id)).steps).toEqual([{ text: "Opened shop.example", done: true }]);
    const approval = await ask(RUNNER, id);
    expect((await job(id)).status).toBe("waiting");
    expect(await as(RUNNER, `select * from public.runner_decision('${approval}')`)).toEqual([{ decision: null, answer: null }]);

    // Not through the function, not by writing the column, and not by asking with the answer already in.
    await expect(decide(RUNNER, approval)).rejects.toThrow(/can't decide/);
    await expect(as(RUNNER, `update public.cloud_approvals set decision = 'allow' where id = '${approval}'`)).rejects.toThrow(/permission denied/);
    await expect(as(RUNNER, `insert into public.cloud_approvals (job_id, owner, kind, text, decision) values ('${id}', '${ALICE}', 'approval', 'Anything', 'allow')`)).rejects.toThrow(/permission denied/);
    await expect(as(RUNNER, `update public.cloud_jobs set action_approval = 'never' where id = '${id}'`)).rejects.toThrow(/permission denied/);
    // Nor anyone signed out, nor another user.
    await expect(decide(null, approval)).rejects.toThrow(/permission denied/);
    expect(await decide(BOB, approval)).toEqual([{ decided: false }]);
    expect(await decision(approval)).toEqual({ decision: null, answer: null });

    expect(await decide(ALICE, approval)).toEqual([{ decided: true }]);
    expect(await as(RUNNER, `select * from public.runner_decision('${approval}')`)).toEqual([{ decision: "allow", answer: null }]);
    // Once only.
    expect(await decide(ALICE, approval, false)).toEqual([{ decided: false }]);
    expect(await decision(approval)).toEqual({ decision: "allow", answer: null });
  });

  it("doesn't let a runner start jobs", async () => {
    await expect(start(RUNNER)).rejects.toThrow(/can't start jobs/);
    await expect(as(RUNNER, `insert into public.cloud_jobs (owner, prompt, mascot) values ('${ALICE}', 'More', ${MASCOT})`)).rejects.toThrow(/permission denied/);
    expect((await db.query(`select id from public.cloud_jobs where owner in ('${ALICE}', '${RUNNER}')`)).rows).toEqual([]);
  });

  it("takes an answer only for a question, and nothing once the job has stopped waiting", async () => {
    const id = await start(ALICE);
    await claim(RUNNER);
    const question = await ask(RUNNER, id, "question");
    expect(await as(ALICE, `select public.decide_cloud_approval('${question}', true, '  Blue  ') as decided`)).toEqual([{ decided: true }]);
    expect(await decision(question)).toEqual({ decision: "allow", answer: "Blue" });

    await as(RUNNER, `select public.runner_update_job('${id}', 'running')`);
    const late = await ask(RUNNER, id);
    // No answer came in time, so the runner stopped it, and the old card can't allow anything now.
    await as(RUNNER, `select public.runner_update_job('${id}', 'stopped', p_error => 'Nobody answered in time.')`);
    expect(await decide(ALICE, late)).toEqual([{ decided: false }]);
    expect((await job(id)).live_view_url).toBeNull();
    expect(await as(RUNNER, `select public.runner_update_job('${id}', 'running') as stop`)).toEqual([{ stop: true }]);
    expect((await job(id)).status).toBe("stopped");
  });

  it("keeps users to their own rows and to what they asked for", async () => {
    const id = await start(ALICE);
    expect(await as(BOB, `select id from public.cloud_jobs where id = '${id}'`)).toEqual([]);
    expect(await as(BOB, `select id from public.my_cloud_jobs(array['${id}'::uuid])`)).toEqual([]);
    expect(await as(BOB, `select public.stop_cloud_job('${id}') as stopped`)).toEqual([{ stopped: false }]);
    expect(await as(BOB, `select public.forget_cloud_job('${id}') as gone`)).toEqual([{ gone: false }]);
    // An owner can't write what the runner did, ask themselves something, or act as a runner.
    for (const set of ["status = 'done'", "reply = 'Done'", `owner = '${BOB}'`, "live_view_url = 'https://www.browserbase.com/x'"]) {
      await expect(as(ALICE, `update public.cloud_jobs set ${set} where id = '${id}'`)).rejects.toThrow(/permission denied/);
    }
    await expect(as(ALICE, `insert into public.cloud_approvals (job_id, owner, kind, text) values ('${id}', '${ALICE}', 'approval', 'x')`)).rejects.toThrow(/permission denied/);
    await expect(claim(ALICE)).rejects.toThrow(/Not a linked runner/);
    await expect(as(null, "select * from public.cloud_jobs")).rejects.toThrow(/permission denied/);
    // Stopping and removing are the owner's, not the runner's.
    expect(await as(RUNNER, `select public.stop_cloud_job('${id}') as stopped`)).toEqual([{ stopped: false }]);
    expect(await as(RUNNER, `select public.forget_cloud_job('${id}') as gone`)).toEqual([{ gone: false }]);
    // A live view that isn't Browserbase's can't be stored at all.
    await claim(RUNNER);
    await expect(as(RUNNER, `select public.runner_update_job('${id}', p_live_view => 'https://evil.example/browserbase.com/')`)).rejects.toThrow(/live_view_shape/);

    expect(await as(ALICE, `select public.stop_cloud_job('${id}') as stopped`)).toEqual([{ stopped: true }]);
    expect((await job(id)).stop_requested).toBe(true);
    expect(await as(RUNNER, `select public.runner_update_job('${id}') as stop`)).toEqual([{ stop: true }]);
    expect(await as(ALICE, `select public.forget_cloud_job('${id}') as gone`)).toEqual([{ gone: true }]);
    expect(await job(id)).toBeUndefined();
  });

  it("stops a queued job at once, and lets an account have five going at a time, made only through the function", async () => {
    const first = await start(BOB);
    expect(await as(BOB, `select public.stop_cloud_job('${first}') as stopped`)).toEqual([{ stopped: true }]);
    expect((await job(first)).status).toBe("stopped");
    for (let at = 0; at < 5; at++) await start(BOB);
    await expect(start(BOB)).rejects.toThrow(/Too many/);
    // Not by writing the row straight in either, and not signed out.
    await expect(as(BOB, `insert into public.cloud_jobs (prompt, mascot) values ('More', ${MASCOT})`)).rejects.toThrow(/permission denied/);
    await expect(as(null, `select public.start_cloud_job('More', '[]', ${MASCOT}, 'risky', null)`)).rejects.toThrow(/permission denied/);
    expect(await as(BOB, "select count(*)::int as n from public.cloud_jobs where status = 'queued'")).toEqual([{ n: 5 }]);
  });

  it("keeps an unlinked user away from the owner's jobs", async () => {
    const id = await start(ALICE);
    const stranger = await newUser();
    expect(await as(stranger, `select id from public.cloud_jobs where id = '${id}'`)).toEqual([]);
    await expect(claim(stranger)).rejects.toThrow(/Not a linked runner/);
    expect(await accept(stranger, ALICE)).toBe(false);
    // Offered, but it never accepted, so it's still nobody's runner.
    const bobs = await start(BOB);
    const offered = await newUser();
    expect(await offer(BOB, offered)).toBe(true);
    expect(await as(offered, `select id from public.cloud_jobs where id = '${bobs}'`)).toEqual([]);
    await expect(claim(offered)).rejects.toThrow(/Not a linked runner/);
  });

  it("only counts a link both sides made, one owner per runner", async () => {
    // Bob offers Alice's runner his jobs. It's already Alice's, so it can't take his too, and sees nothing of them.
    expect(await offer(BOB, RUNNER)).toBe(true);
    expect(await accept(RUNNER, BOB)).toBe(false);
    const bobs = await start(BOB);
    expect(await as(RUNNER, `select id from public.cloud_jobs where id = '${bobs}'`)).toEqual([]);
    // Naming someone's own account doesn't make it a runner: they'd have to accept, and one with jobs can't.
    const stranger = await newUser();
    expect(await offer(stranger, BOB)).toBe(true);
    expect(await accept(BOB, stranger)).toBe(false);
    expect(await as(BOB, `select id from public.cloud_jobs where id = '${bobs}'`)).toEqual([{ id: bobs }]);
    // Nobody links themselves, and the owner sees who their runner is.
    expect(await offer(ALICE, ALICE)).toBe(false);
    expect(await as(ALICE, "select * from public.my_cloud_runner()")).toEqual([{ email: await emailOf(RUNNER), accepted: true }]);
  });

  it("takes everything from a runner once it's unlinked", async () => {
    const id = await start(ALICE);
    await as(ALICE, "select public.unlink_cloud_runner()");
    expect(await as(RUNNER, `select id from public.cloud_jobs where id = '${id}'`)).toEqual([]);
    await expect(claim(RUNNER)).rejects.toThrow(/Not a linked runner/);
    expect(await as(ALICE, "select * from public.my_cloud_runner()")).toEqual([]);
  });
});
