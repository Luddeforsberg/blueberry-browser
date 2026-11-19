import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PALETTES } from "../src/shared/mascots";
import { defined } from "../src/shared/testing";

// The palette ids on the two tables that store a look, before and after 20261119000000_berry_palettes.sql, in real
// Postgres. The tables' other rules are in gallery.test.ts and phone.test.ts.
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;
const OWNER = "00000000-0000-4000-8000-00000000000a";
const migration = (file: string) => readFileSync(join(__dirname, "migrations", file), "utf8");

describe("a look's palette on the server", () => {
  let db: PGlite;
  let made = 0;

  const publish = (palette: string) =>
    db.query(
      `insert into public.mascots (owner, name, palette, accessory, description, category, instructions, author_name)
       values ($1, 'Scout', $2, 'cap', 'Reads.', 'Work', 'Read.', 'Ana')`,
      [OWNER, palette],
    );
  const share = (palette: string) =>
    db.query(
      `insert into public.cloud_flock (owner, id, position, name, palette, accessory, instructions)
       values ($1, $2, 0, 'Scout', $3, 'cap', 'Read.')`,
      [OWNER, `m-${++made}`, palette],
    );

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STANDINS);
    await db.exec(`insert into auth.users (id) values ('${OWNER}')`);
    for (const file of ["20261101000000_gallery.sql", "20261102000000_cloud_jobs.sql", "20261103000000_phone.sql"]) {
      await db.exec(migration(file));
    }
  });
  afterAll(() => db.close());

  it("takes only the old ids before the migration, which is why apps still send those", async () => {
    for (const { id, oldId } of PALETTES) {
      await expect(publish(oldId)).resolves.toBeTruthy();
      await expect(share(oldId)).resolves.toBeTruthy();
      await expect(publish(id)).rejects.toThrow(/look_shape/);
      await expect(share(id)).rejects.toThrow(/look_shape/);
    }
  });

  it("takes the old and the new ids after it, and keeps the rows it had", async () => {
    const before = defined((await db.query<{ count: number }>("select count(*)::int as count from public.mascots")).rows[0]).count;
    await db.exec(migration("20261119000000_berry_palettes.sql"));
    expect(defined((await db.query<{ count: number }>("select count(*)::int as count from public.mascots")).rows[0]).count).toBe(before);
    for (const { id, oldId } of PALETTES) {
      for (const palette of [id, oldId]) {
        await expect(publish(palette)).resolves.toBeTruthy();
        await expect(share(palette)).resolves.toBeTruthy();
      }
    }
    for (const palette of ["red", "Lingon", ""]) {
      await expect(publish(palette)).rejects.toThrow(/look_shape/);
      await expect(share(palette)).rejects.toThrow(/look_shape/);
    }
  });
});
