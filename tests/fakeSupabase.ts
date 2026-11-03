import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

export const FAKE_KEY = "sb_publishable_fake_for_tests_only";

type Row = Record<string, unknown> & { id: string; owner: string; hidden: boolean; add_count: number };

// The cloud runner's functions, which run in real Postgres here with the real migration, as the user each token stands
// for, so the app and the runner, which signs in as a user of its own, meet the real rules.
const CLOUD_FUNCTIONS = new Set([
  "start_cloud_job", "my_cloud_jobs", "stop_cloud_job", "decide_cloud_approval", "forget_cloud_job", "forget_cloud_conversation",
  "link_cloud_runner", "unlink_cloud_runner", "my_cloud_runner", "accept_cloud_runner_link",
  "runner_claim_job", "runner_update_job", "runner_ask", "runner_decision",
  "sync_cloud_flock", "save_push_subscription", "forget_push_subscription", "runner_push_subscriptions", "runner_forget_push_subscription", "runner_set_relay_url",
]);
// Tables the phone page reads with a plain select, as the user each token stands for, so row-level security decides.
const CLOUD_TABLES = new Set(["cloud_jobs", "cloud_flock"]);
const CLOUD_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const cloudDatabase = async () => {
  const db = new PGlite();
  await db.exec(CLOUD_STANDINS);
  await db.exec(readFileSync(join(__dirname, "../supabase/migrations/20261102000000_cloud_jobs.sql"), "utf8"));
  await db.exec(readFileSync(join(__dirname, "../supabase/migrations/20261103000000_phone.sql"), "utf8"));
  await db.exec(readFileSync(join(__dirname, "../supabase/migrations/20261104000000_cloud_conversations.sql"), "utf8"));
  await db.exec(readFileSync(join(__dirname, "../supabase/migrations/20261105000000_cloud_routines.sql"), "utf8"));
  await db.exec(readFileSync(join(__dirname, "../supabase/migrations/20261106000000_cloud_relay.sql"), "utf8"));
  // One connection, so one call at a time, each with its own role.
  let queue: Promise<unknown> = Promise.resolve();
  const call = (role: string, uid: string | null, name: string, args: Record<string, unknown>) => {
    const run = queue.then(async () => {
      const names = Object.keys(args).filter((key) => /^p_\w+$/.test(key));
      await db.query("select set_config('test.uid', $1, false)", [uid ?? ""]);
      await db.exec(`set role ${role}`);
      try {
        const { rows } = await db.query<Record<string, unknown>>(`select * from public.${name}(${names.map((key, at) => `${key} => $${at + 1}`).join(", ")})`, names.map((key) => args[key]));
        // A function returning one value answers with it, as the REST API does. One returning rows answers with them.
        return rows.length === 1 && Object.keys(rows[0]).length === 1 && name in rows[0] ? rows[0][name] : rows;
      } finally {
        await db.exec("reset role");
      }
    });
    queue = run.catch(() => {});
    return run;
  };
  // A select in PostgREST's shape, for the few it's asked: columns, `eq.` or `not.is.null` on a few columns, an order,
  // a limit and an offset.
  const select = (uid: string | null, table: string, params: URLSearchParams) => {
    const run = queue.then(async () => {
      const columns = params.get("select") ?? "*";
      if (!/^[a-z_,*]+$/.test(columns)) throw Object.assign(new Error("Bad select"), { code: "PGRST100" });
      const values: string[] = [];
      const filters = ["owner", "id", "conversation_id"].flatMap((column) => {
        const filter = params.get(column);
        if (filter === null) return [];
        if (filter === "not.is.null") return [`${column} is not null`];
        if (!filter.startsWith("eq.")) throw Object.assign(new Error("Bad filter"), { code: "PGRST100" });
        values.push(filter.slice(3));
        return [`${column}::text = $${values.length}`];
      });
      const [orderBy, direction] = (params.get("order") ?? "").split(".");
      const limit = Number(params.get("limit")) || 100;
      const offset = Number(params.get("offset")) || 0;
      await db.query("select set_config('test.uid', $1, false)", [uid ?? ""]);
      await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
      try {
        const where = filters.length ? `where ${filters.join(" and ")}` : "";
        const order = /^[a-z_]+$/.test(orderBy ?? "") ? `order by ${orderBy} ${direction === "desc" ? "desc" : "asc"}` : "";
        const sql = `select ${columns} from public.${table} ${where} ${order} limit ${limit} offset ${offset}`;
        return (await db.query<Record<string, unknown>>(sql, values)).rows;
      } finally {
        await db.exec("reset role");
      }
    });
    queue = run.catch(() => {});
    return run;
  };
  return { db, call, select };
};

// A local stand-in for the parts of Supabase's REST and Auth APIs the app uses, so the app's real requests are what get
// tested. The real rules are tested on real Postgres, in supabase/gallery.test.ts. This only keeps to their shape, apart
// from the cloud runner's jobs, which with `cloudJobs` are the real rules in real Postgres.
export const startFakeSupabase = async ({ cloudJobs = false }: { cloudJobs?: boolean } = {}) => {
  const cloud = cloudJobs ? await cloudDatabase() : null;
  const accounts = new Map<string, { password: string; id: string }>();
  const tokens = new Map<string, string>();
  // Each refresh token works once, as Supabase's do.
  const refreshTokens = new Map<string, { email: string; id: string }>();
  const rows: Row[] = [];
  const adders = new Set<string>();
  // Everything the app ever sent, to check nothing extra left the computer.
  const received: { path: string; method: string; body: string; apikey: string }[] = [];
  const state = { down: false };

  const sessionFor = (email: string, id: string) => {
    const token = `access-${randomUUID()}`;
    tokens.set(token, id);
    const refresh = `refresh-${randomUUID()}`;
    refreshTokens.set(refresh, { email, id });
    return { access_token: token, refresh_token: refresh, expires_in: 3600, user: { id, email } };
  };

  const server = createServer(async (request, response) => {
    let text = "";
    for await (const part of request) text += part;
    const url = new URL(request.url ?? "/", "http://fake");
    received.push({ path: url.pathname + url.search, method: request.method ?? "", body: text, apikey: String(request.headers.apikey) });
    // The phone page is served from another origin, as Supabase allows.
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-headers", "apikey, authorization, content-type, prefer");
    response.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      return response.end();
    }
    const answer = (status: number, body?: unknown) => {
      response.statusCode = status;
      response.setHeader("content-type", "application/json");
      response.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (state.down) return answer(503, { message: "down" });
    if (request.headers.apikey !== FAKE_KEY) return answer(401, { message: "Invalid API key" });
    const body = text ? JSON.parse(text) : {};
    const uid = tokens.get(String(request.headers.authorization).replace("Bearer ", ""));
    const route = `${request.method} ${url.pathname}`;
    const id = url.searchParams.get("id")?.replace("eq.", "");

    if (route === "POST /auth/v1/signup") {
      if (accounts.has(body.email)) return answer(422, { error_code: "user_already_exists", msg: "Exists" });
      const account = { password: body.password, id: randomUUID() };
      accounts.set(body.email, account);
      await cloud?.db.query("insert into auth.users values ($1, $2)", [account.id, body.email]);
      return answer(200, sessionFor(body.email, account.id));
    }
    if (route === "POST /auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const account = accounts.get(body.email);
      if (!account || account.password !== body.password) return answer(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return answer(200, sessionFor(body.email, account.id));
    }
    if (route === "POST /auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const found = refreshTokens.get(body.refresh_token);
      if (!found) return answer(400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      refreshTokens.delete(body.refresh_token);
      return answer(200, sessionFor(found.email, found.id));
    }
    if (route === "POST /auth/v1/logout") return answer(204);

    const cloudCall = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname)?.[1];
    if (cloud && request.method === "POST" && cloudCall && CLOUD_FUNCTIONS.has(cloudCall)) {
      try {
        return answer(200, await cloud.call(uid ? "authenticated" : "anon", uid ?? null, cloudCall, body));
      } catch (error) {
        const { code, message } = error as { code?: string; message?: string };
        return answer(code === "42501" ? 403 : code === "23505" ? 409 : 400, { code, message });
      }
    }

    const cloudTable = /^\/rest\/v1\/(\w+)$/.exec(url.pathname)?.[1];
    if (cloud && request.method === "GET" && cloudTable && CLOUD_TABLES.has(cloudTable)) {
      try {
        return answer(200, await cloud.select(uid ?? null, cloudTable, url.searchParams));
      } catch (error) {
        const { code, message } = error as { code?: string; message?: string };
        return answer(code === "42501" ? 403 : code === "23505" ? 409 : 400, { code, message });
      }
    }

    if (route === "GET /rest/v1/mascots") return answer(200, rows.filter((row) => !row.hidden).map(({ owner: _owner, hidden: _hidden, ...row }) => row));
    if (route === "POST /rest/v1/rpc/my_mascots") return answer(200, rows.filter((row) => row.owner === uid).map(({ owner: _owner, ...row }) => row));
    if (route === "POST /rest/v1/rpc/record_add") {
      const row = rows.find((candidate) => candidate.id === body.p_mascot);
      const adder = `${body.p_mascot} ${uid ?? body.p_install}`;
      if (row && row.owner !== uid && !adders.has(adder)) {
        adders.add(adder);
        row.add_count++;
      }
      return answer(204);
    }
    if (route === "POST /rest/v1/mascots") {
      if (!uid) return answer(401, { message: "No user" });
      const row: Row = { ...body, id: randomUUID(), owner: uid, hidden: false, add_count: 0, created_at: new Date().toISOString() };
      rows.push(row);
      return answer(201, [{ id: row.id }]);
    }
    if (route === "PATCH /rest/v1/mascots") {
      const row = rows.find((candidate) => candidate.id === id && candidate.owner === uid);
      if (row) Object.assign(row, body);
      return answer(200, row ? [{ id: row.id }] : []);
    }
    if (route === "DELETE /rest/v1/mascots") {
      const at = rows.findIndex((candidate) => candidate.id === id && candidate.owner === uid);
      const removed = at >= 0 ? rows.splice(at, 1) : [];
      return answer(200, removed.map((row) => ({ id: row.id })));
    }
    return answer(404, { message: "Not here" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    env: { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: FAKE_KEY, BLUEBERRY_SITE_URL: "https://gallery.example" },
    rows,
    received,
    state,
    // A row as someone else, or something else, might have stored it.
    seed: (row: Record<string, unknown>) => {
      const seeded: Row = { id: randomUUID(), owner: randomUUID(), hidden: false, add_count: 0, created_at: new Date().toISOString(), ...row };
      rows.push(seeded);
      return seeded;
    },
    // An account made the way the dashboard does, such as the runner's own.
    addAccount: async (email: string, password: string) => {
      const id = randomUUID();
      accounts.set(email, { password, id });
      await cloud?.db.query("insert into auth.users values ($1, $2)", [id, email]);
    },
    // What's in the cloud jobs' tables, as the database sees it.
    cloudRows: async (sql: string) => (await cloud!.db.query<Record<string, unknown>>(sql)).rows,
    close: () => {
      server.close();
      void cloud?.db.close();
    },
  };
};
