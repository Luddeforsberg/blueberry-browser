import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The real migration in real Postgres (compiled to WebAssembly), as the roles Supabase uses. Only `auth` is a stand-in.
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- What a Supabase project does for new tables and functions, which the migration has to undo.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const INSTALL = "00000000-0000-4000-8000-000000000001";
const COLUMNS = "name, palette, accessory, description, category, instructions, author_name";
const VALUES = "'Scout', 'robin', 'cap', 'Reads.', 'Work', 'Read.', 'Ana'";

describe("the Gallery's database rules", () => {
  let db: PGlite;

  // As a client: one role, one user, and the same error a client would get.
  const as = async <T = Record<string, unknown>>(uid: string | null, sql: string): Promise<T[]> => {
    await db.exec(`set test.uid = '${uid ?? ""}'; set role ${uid ? "authenticated" : "anon"};`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const publish = async (uid: string, values = VALUES) =>
    (await as<{ id: string }>(uid, `insert into public.mascots (${COLUMNS}) values (${values}) returning id`))[0].id;
  const row = async (id: string) => (await db.query<{ add_count: number; hidden: boolean; owner: string; name: string }>("select * from public.mascots where id = $1", [id])).rows[0];
  const add = (uid: string | null, id: string, install = INSTALL) => as(uid, `select public.record_add('${id}', '${install}')`);

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    await db.exec(`insert into auth.users values ('${ALICE}'), ('${BOB}')`);
    await db.exec(readFileSync(join(__dirname, "migrations/20261101000000_gallery.sql"), "utf8"));
  });
  afterAll(() => db.close());

  it("lets anyone read what isn't hidden, but not who owns it", async () => {
    const id = await publish(ALICE);
    expect(await as(null, `select name from public.mascots where id = '${id}'`)).toEqual([{ name: "Scout" }]);
    await expect(as(null, "select * from public.mascots")).rejects.toThrow(/permission denied/);
    await expect(as(null, "select owner from public.mascots")).rejects.toThrow(/permission denied/);
    await expect(as(BOB, "select hidden from public.mascots")).rejects.toThrow(/permission denied/);
    await expect(as(null, "select * from public.mascot_adds")).rejects.toThrow(/permission denied/);
  });

  it("hides a hidden one from everyone but its author's own list", async () => {
    const id = await publish(ALICE);
    await db.query("update public.mascots set hidden = true where id = $1", [id]);
    expect(await as(null, `select id from public.mascots where id = '${id}'`)).toEqual([]);
    expect(await as(BOB, `select id from public.mascots where id = '${id}'`)).toEqual([]);
    const mine = await as<{ id: string; hidden: boolean }>(ALICE, "select * from public.my_mascots()");
    expect(mine.find((mascot) => mascot.id === id)?.hidden).toBe(true);
    expect(await as(BOB, "select * from public.my_mascots()")).toEqual([]);
    await expect(as(null, "select * from public.my_mascots()")).rejects.toThrow(/permission denied/);
  });

  it("only lets the owner write, and only the columns that are theirs", async () => {
    const id = await publish(ALICE);
    await expect(as(null, `insert into public.mascots (${COLUMNS}) values (${VALUES})`)).rejects.toThrow(/permission denied/);
    await expect(as(BOB, `insert into public.mascots (owner, ${COLUMNS}) values ('${ALICE}', ${VALUES})`)).rejects.toThrow(/permission denied/);
    expect(await as(BOB, `update public.mascots set name = 'Stolen' where id = '${id}' returning id`)).toEqual([]);
    expect(await as(BOB, `delete from public.mascots where id = '${id}' returning id`)).toEqual([]);
    for (const set of ["hidden = true", "add_count = 999", `owner = '${BOB}'`, "created_at = now()"]) {
      await expect(as(ALICE, `update public.mascots set ${set} where id = '${id}'`)).rejects.toThrow(/permission denied/);
    }
    await expect(as(ALICE, `insert into public.mascots (hidden, ${COLUMNS}) values (false, ${VALUES})`)).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, `insert into public.mascots (add_count, ${COLUMNS}) values (9, ${VALUES})`)).rejects.toThrow(/permission denied/);
    expect(await as(ALICE, `update public.mascots set name = 'Mine' where id = '${id}' returning id`)).toEqual([{ id }]);
    expect((await row(id)).name).toBe("Mine");
    expect((await row(id)).owner).toBe(ALICE);
    expect(await as(ALICE, `delete from public.mascots where id = '${id}' returning id`)).toEqual([{ id }]);
    expect(await row(id)).toBeUndefined();
  });

  it.each([
    ["a name with a tag in it", "'<a>', 'robin', 'cap', 'Reads.', 'Work', 'Read.', 'Ana'"],
    ["a name of 25", `'${"x".repeat(25)}', 'robin', 'cap', 'Reads.', 'Work', 'Read.', 'Ana'`],
    ["Berry's name", "'Berry', 'robin', 'cap', 'Reads.', 'Work', 'Read.', 'Ana'"],
    ["an unknown look", "'Scout', 'neon', 'cap', 'Reads.', 'Work', 'Read.', 'Ana'"],
    ["an unknown category", "'Scout', 'robin', 'cap', 'Reads.', 'Spam', 'Read.', 'Ana'"],
    ["instructions of 2001", `'Scout', 'robin', 'cap', 'Reads.', 'Work', '${"x".repeat(2001)}', 'Ana'`],
    ["an author who's an address", "'Scout', 'robin', 'cap', 'Reads.', 'Work', 'Read.', 'a@b.se'"],
    ["an author passing for us", "'Scout', 'robin', 'cap', 'Reads.', 'Work', 'Read.', 'The Blueberry team'"],
  ])("refuses %s", async (_, values) => {
    await expect(publish(BOB, values)).rejects.toThrow(/check constraint/);
  });

  it("refuses more than 20 sites, unknown tools and half an example", async () => {
    const columns = `sites, ${COLUMNS}`;
    const sites = `array[${Array.from({ length: 21 }, (_, at) => `'s${at}.se'`).join(",")}]`;
    await expect(as(BOB, `insert into public.mascots (${columns}) values (${sites}, ${VALUES})`)).rejects.toThrow(/sites_shape/);
    await expect(as(BOB, `insert into public.mascots (tools, ${COLUMNS}) values (array['everything'], ${VALUES})`)).rejects.toThrow(/tools_shape/);
    await expect(as(BOB, `insert into public.mascots (example_prompt, ${COLUMNS}) values ('Hi', ${VALUES})`)).rejects.toThrow(/example_shape/);
  });

  it("counts one add per install or account, never an author's own, and only through the function", async () => {
    const id = await publish(ALICE);
    await add(null, id);
    await add(null, id);
    expect((await row(id)).add_count).toBe(1);

    // The same install signed in, then the same account on another computer.
    await add(BOB, id);
    expect((await row(id)).add_count).toBe(1);
    const other = await publish(ALICE);
    await add(BOB, other);
    await add(BOB, other, "00000000-0000-4000-8000-000000000002");
    expect((await row(other)).add_count).toBe(1);

    await add(ALICE, id, "00000000-0000-4000-8000-000000000003");
    expect((await row(id)).add_count).toBe(1);

    // Counted before signing in, and that account still counts once from another computer.
    const anonymousFirst = await publish(ALICE);
    await add(null, anonymousFirst);
    await add(BOB, anonymousFirst);
    await add(BOB, anonymousFirst, "00000000-0000-4000-8000-000000000004");
    expect((await row(anonymousFirst)).add_count).toBe(1);

    // The hourly limit counts adds, not rows, and a signed-in add has two.
    const popular = await publish(ALICE);
    const nth = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
    for (let n = 1; n <= 40; n++) await add(nth(n), popular, nth(n + 100));
    expect((await row(popular)).add_count).toBe(40);
    for (let n = 41; n <= 65; n++) await add(null, popular, nth(n + 100));
    expect((await row(popular)).add_count).toBe(60);

    await expect(as(null, `update public.mascots set add_count = 9 where id = '${id}'`)).rejects.toThrow(/permission denied/);
    await expect(as(null, `insert into public.mascot_adds values ('${id}', 'install:x')`)).rejects.toThrow(/permission denied/);
    await expect(as(null, "select public.mascots_before_write()")).rejects.toThrow();
  });

  it("doesn't count a hidden one, and stops counting a burst at 60 an hour", async () => {
    const hidden = await publish(ALICE);
    await db.query("update public.mascots set hidden = true where id = $1", [hidden]);
    await add(null, hidden);
    expect((await row(hidden)).add_count).toBe(0);

    const id = await publish(ALICE);
    for (let at = 0; at < 61; at++) await add(null, id, `00000000-0000-4000-9000-${String(at).padStart(12, "0")}`);
    expect((await row(id)).add_count).toBe(60);
  });

  it("stops an account at 20 published", async () => {
    const CAROL = "00000000-0000-4000-8000-00000000000c";
    await db.exec(`insert into auth.users values ('${CAROL}')`);
    for (let at = 0; at < 20; at++) await publish(CAROL);
    await expect(publish(CAROL)).rejects.toThrow(/Too many/);
  });
});
