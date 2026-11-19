import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PALETTES } from "../src/shared/mascots";

// 20261120000000_mascot_names.sql in real Postgres as Supabase's roles, on top of every migration before it: the new
// names, and the old ones that clients from before still call, which must do and refuse exactly the same.
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- What a Supabase project does for new tables, views and functions, which the migration has to undo.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;
const RENAME = "20261120000000_mascot_names.sql";
const MIGRATIONS = readdirSync(join(__dirname, "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const BEFORE = MIGRATIONS.slice(0, MIGRATIONS.indexOf(RENAME));

// What each name reads back for Scout's lingon: the old names give the old palette id, the only one a client from before reads.
const NAMES = {
  new: { table: "cloud_mascots", sync: "sync_cloud_mascots", param: "p_mascots", relay: "relay_mascots", lingon: "lingon" },
  old: { table: "cloud_flock", sync: "sync_cloud_flock", param: "p_birds", relay: "relay_flock", lingon: "robin" },
};
const SCOUT = {
  id: "m-1",
  name: "Scout",
  palette: "lingon",
  accessory: "cap",
  instructions: "Find cables.",
  sites: ["webhallen.com"],
  tools: ["visit", "click"],
  from_gallery: false,
};
const PRIVILEGES = ["select", "insert", "update", "delete", "truncate", "references", "trigger"];
const ROLES = ["anon", "authenticated"];

describe("the mascots' names on the server", () => {
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

  // Who may do what to a table or function, as Postgres answers it, so the old name's before and after can be compared.
  const tableGrants = async (table: string) =>
    (
      await db.query<{ grants: string }>(
        `select string_agg(r || ':' || p || '=' || has_table_privilege(r, $1, p)::text, ',' order by r, p) as grants
         from unnest($2::text[]) r, unnest($3::text[]) p`,
        [`public.${table}`, ROLES, PRIVILEGES],
      )
    ).rows[0].grants;
  const functionGrants = async (signature: string) =>
    (
      await db.query<{ anon: boolean; authenticated: boolean }>(
        "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authenticated",
        [`public.${signature}`],
      )
    ).rows[0];
  const policies = async (table: string) =>
    (
      await db.query(
        "select cmd, roles::text, qual, with_check, permissive from pg_policies where schemaname = 'public' and tablename = $1",
        [table],
      )
    ).rows;

  let ALICE = "";
  // Shared a mascot before the rename, and has nothing else written to her, so no test can change what she kept.
  let KEEPER = "";
  let RUNNER = "";
  let BOB = "";
  let BOBS_RUNNER = "";
  let SECRET = "";
  const before: Record<string, unknown> = {};
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    for (const file of BEFORE) await db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
    [ALICE, RUNNER, BOB, BOBS_RUNNER, KEEPER] = [await newUser(), await newUser(), await newUser(), await newUser(), await newUser()];
    await link(ALICE, RUNNER);
    await link(BOB, BOBS_RUNNER);
    SECRET = String(await one(ALICE, "select public.create_relay_grant()"));
    // A mascot shared before the rename, under the old name, and who could do what then.
    await as(KEEPER, `select public.sync_cloud_flock('${JSON.stringify([{ ...SCOUT, id: "kept", palette: "robin" }])}'::jsonb)`);
    before.table = await tableGrants("cloud_flock");
    before.sync = await functionGrants("sync_cloud_flock(jsonb)");
    before.relay = await functionGrants("relay_flock(text)");
    before.policies = await policies("cloud_flock");
    before.rls = (
      await db.query("select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.cloud_flock'::regclass")
    ).rows;
    for (const file of MIGRATIONS.slice(BEFORE.length)) await db.exec(readFileSync(join(__dirname, "migrations", file), "utf8"));
  });
  afterAll(() => db.close());

  it("keeps the rows, row-level security, policy and grants the old table had, on the new name", async () => {
    expect(await as(KEEPER, "select id, palette from public.cloud_mascots")).toEqual([{ id: "kept", palette: "robin" }]);
    expect(await tableGrants("cloud_mascots")).toBe(before.table);
    expect(await policies("cloud_mascots")).toEqual(before.policies);
    expect(
      (await db.query("select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.cloud_mascots'::regclass")).rows,
    ).toEqual(before.rls);
    expect(await functionGrants("sync_cloud_mascots(jsonb)")).toEqual(before.sync);
    expect(await functionGrants("relay_mascots(text)")).toEqual(before.relay);
  });

  it("keeps the old names' grants as they were, and the old view runs as whoever reads it", async () => {
    expect(await tableGrants("cloud_flock")).toBe(before.table);
    expect(await functionGrants("sync_cloud_flock(jsonb)")).toEqual(before.sync);
    expect(await functionGrants("relay_flock(text)")).toEqual(before.relay);
    expect((await db.query("select reloptions from pg_class where oid = 'public.cloud_flock'::regclass")).rows).toEqual([
      { reloptions: ["security_invoker=true"] },
    ]);
    // The wrappers can't do more than their caller: neither runs as its owner.
    const definers = await db.query("select proname from pg_proc where proname in ('sync_cloud_flock', 'relay_flock') and prosecdef");
    expect(definers.rows).toEqual([]);
  });

  it("gives a client from before every look's old palette id, whichever id each was written with", async () => {
    const old = PALETTES.map(({ oldId }, i) => ({ id: `p-${i}`, palette: oldId }));
    for (const written of ["id", "oldId"] as const) {
      const all = PALETTES.map((palette, i) => ({ ...SCOUT, id: `p-${i}`, name: `Pip ${i}`, palette: palette[written] }));
      await as(ALICE, `select public.sync_cloud_mascots('${JSON.stringify(all)}'::jsonb)`);
      expect(await as(ALICE, "select id, palette from public.cloud_flock order by position"), written).toEqual(old);
      expect(await as(RUNNER, `select id, palette from public.relay_flock('${SECRET}')`), written).toEqual(old);
    }
  });

  for (const [which, { table, sync, param, relay, lingon }] of Object.entries(NAMES)) {
    const share = (uid: string | null, mascots: unknown) =>
      as(uid, `select public.${sync}(${param} => '${JSON.stringify(mascots)}'::jsonb) as kept`);

    describe(`by the ${which} names`, () => {
      beforeEach(async () => {
        await share(ALICE, [SCOUT]);
      });

      it("keeps each owner's mascots to that owner, replaced whole on every sync", async () => {
        expect(await share(ALICE, [SCOUT, { ...SCOUT, id: "m-2", name: "Penny", palette: "flamingo" }])).toEqual([{ kept: 2 }]);
        expect(await share(ALICE, [SCOUT])).toEqual([{ kept: 1 }]);
        expect(await share(BOB, [{ ...SCOUT, id: "b-1" }])).toEqual([{ kept: 1 }]);
        // Each name reads the same rows: only the reader's own.
        for (const names of Object.values(NAMES)) {
          const name = names.table;
          expect(await as(ALICE, `select id, name, position, palette, sites, tools from public.${name}`)).toEqual([
            { id: "m-1", name: "Scout", position: 0, palette: names.lingon, sites: ["webhallen.com"], tools: ["visit", "click"] },
          ]);
          expect(await as(BOB, `select id from public.${name}`)).toEqual([{ id: "b-1" }]);
          expect(await as(RUNNER, `select id from public.${name}`)).toEqual([]);
        }
      });

      it("refuses what it refused before", async () => {
        await expect(as(null, `select id from public.${table}`)).rejects.toThrow(/permission denied/);
        for (const write of [
          `insert into public.${table} (id, position, name, accessory, instructions) values ('x', 0, 'X', 'cap', 'Y')`,
          `update public.${table} set name = 'Taken'`,
          `delete from public.${table}`,
        ]) {
          await expect(as(ALICE, write), write).rejects.toThrow(/permission denied/);
        }
        await expect(share(RUNNER, [SCOUT])).rejects.toThrow(/A runner has no mascots/);
        await expect(share(null, [SCOUT])).rejects.toThrow(/permission denied/);
        await expect(share(ALICE, { not: "a list" })).rejects.toThrow(/Not a list of mascots/);
        await expect(share(ALICE, [{ ...SCOUT, tools: ["visit", "pay"] }])).rejects.toThrow(/tools_shape/);
        await expect(share(ALICE, [{ ...SCOUT, id: "berry" }])).rejects.toThrow(/id_shape/);
        await expect(share(ALICE, [{ ...SCOUT, palette: "red" }])).rejects.toThrow(/look_shape/);
        // A refused sync leaves the last one.
        expect(await as(ALICE, `select id from public.${table}`)).toEqual([{ id: "m-1" }]);
      });

      it("gives the relay its owner's mascots only with the grant's runner and secret", async () => {
        expect(await as(RUNNER, `select id, name, palette from public.${relay}('${SECRET}')`)).toEqual([
          { id: "m-1", name: "Scout", palette: lingon },
        ]);
        for (const uid of [ALICE, BOBS_RUNNER, BOB]) {
          await expect(as(uid, `select * from public.${relay}('${SECRET}')`)).rejects.toThrow(/Not a grant of this runner/);
        }
        await expect(as(RUNNER, `select * from public.${relay}('wrong')`)).rejects.toThrow(/Not a grant of this runner/);
        await expect(as(null, `select * from public.${relay}('${SECRET}')`)).rejects.toThrow(/permission denied/);
      });
    });
  }
});
