import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// What the runner can read of its owner's approvals, in real Postgres as Supabase's roles, on top of every migration.
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
];

const MASCOT = `'{"id":"berry","name":"Berry"}'::jsonb`;

describe("the runner's view of approvals", () => {
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
  const seen = async (runner: string) => (await as<{ id: string }>(runner, "select id from public.cloud_approvals")).map(({ id }) => id);
  const decisionOf = (runner: string, approval: string) => as(runner, `select * from public.runner_decision('${approval}')`);

  let ALICE = "";
  let RUNNER = "";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of MIGRATIONS) await db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
  });
  beforeEach(async () => {
    [ALICE, RUNNER] = [await newUser(), await newUser()];
    await link(ALICE, RUNNER);
  });
  afterAll(() => db.close());

  // A job of Alice's that the runner has claimed and asked about.
  const asked = async () => {
    const job = String(await one(ALICE, `select public.start_cloud_job('Order the thing', '[]', ${MASCOT}, 'risky', null)`));
    expect(await as(RUNNER, "select id from public.runner_claim_job()")).toEqual([{ id: job }]);
    const approval = String(await one(RUNNER, `select public.runner_ask('${job}', 'question', 'Which colour?')`));
    return { job, approval };
  };

  it("reads a running job's approval, and the decision on it", async () => {
    const { approval } = await asked();
    expect(await seen(RUNNER)).toEqual([approval]);
    expect(await decisionOf(RUNNER, approval)).toEqual([{ decision: null, answer: null }]);
    expect(await one(ALICE, `select public.decide_cloud_approval('${approval}', true, 'Blue')`)).toBe(true);
    expect(await decisionOf(RUNNER, approval)).toEqual([{ decision: "allow", answer: "Blue" }]);
  });

  it("reads nothing of a job once it has ended", async () => {
    const { job, approval } = await asked();
    expect(await one(ALICE, `select public.decide_cloud_approval('${approval}', true, 'Blue')`)).toBe(true);
    await as(RUNNER, `select public.runner_update_job('${job}', 'done', p_reply => 'Ordered it in blue')`);
    expect((await db.query<{ status: string }>("select status from public.cloud_jobs where id = $1", [job])).rows[0].status).toBe("done");
    expect(await seen(RUNNER)).toEqual([]);
    expect(await decisionOf(RUNNER, approval)).toEqual([]);
    // Alice still has hers.
    expect((await as(ALICE, "select id from public.cloud_approvals")).map(({ id }) => id)).toEqual([approval]);
  });

  it("reads nothing of a job that ended because the runner went quiet", async () => {
    const { job, approval } = await asked();
    await db.query("update public.cloud_jobs set heartbeat_at = now() - interval '3 minutes' where id = $1", [job]);
    expect(await as(RUNNER, "select id from public.runner_claim_job()")).toEqual([]);
    expect(await seen(RUNNER)).toEqual([]);
    expect(await decisionOf(RUNNER, approval)).toEqual([]);
  });
});
