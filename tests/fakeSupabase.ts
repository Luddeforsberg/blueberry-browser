import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const FAKE_KEY = "sb_publishable_fake_for_tests_only";

type Row = Record<string, unknown> & { id: string; owner: string; hidden: boolean; add_count: number };

// A local stand-in for the parts of Supabase's REST and Auth APIs the app uses, so the app's real requests are what get
// tested. The real rules are tested on real Postgres, in supabase/gallery.test.ts. This only keeps to their shape.
export const startFakeSupabase = async () => {
  const accounts = new Map<string, { password: string; id: string }>();
  const tokens = new Map<string, string>();
  const rows: Row[] = [];
  const adders = new Set<string>();
  // Everything the app ever sent, to check nothing extra left the computer.
  const received: { path: string; method: string; body: string; apikey: string }[] = [];
  const state = { down: false };

  const sessionFor = (email: string, id: string) => {
    const token = `access-${randomUUID()}`;
    tokens.set(token, id);
    return { access_token: token, refresh_token: `refresh-${randomUUID()}`, expires_in: 3600, user: { id, email } };
  };

  const server = createServer(async (request, response) => {
    let text = "";
    for await (const part of request) text += part;
    const url = new URL(request.url ?? "/", "http://fake");
    received.push({ path: url.pathname + url.search, method: request.method ?? "", body: text, apikey: String(request.headers.apikey) });
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
      return answer(200, sessionFor(body.email, account.id));
    }
    if (route === "POST /auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const account = accounts.get(body.email);
      if (!account || account.password !== body.password) return answer(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return answer(200, sessionFor(body.email, account.id));
    }
    if (route === "POST /auth/v1/logout") return answer(204);

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
    close: () => server.close(),
  };
};
