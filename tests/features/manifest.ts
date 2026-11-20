import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENTRIES, readRequest, type Entry } from "./shots";

// After every picture is taken: manifest.json lists them, with the commit they were taken on.
export default function writeManifest(): void {
  const { out, commit } = readRequest();
  const folder = join(out, ENTRIES);
  if (!existsSync(folder)) return;
  const fresh = readdirSync(folder).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as Entry);
  // A drive into a folder that has some already adds to what's there.
  const file = join(out, "manifest.json");
  const before = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { shots: Entry[] }).shots : [];
  const shots = [...before.filter((old) => !fresh.some((entry) => entry.file === old.file)), ...fresh].sort((a, b) =>
    a.file.localeCompare(b.file),
  );
  writeFileSync(file, JSON.stringify({ commit, shots }, null, 2));
  rmSync(folder, { recursive: true, force: true });
  const restless = fresh.filter((entry) => entry.restless);
  if (restless.length)
    console.log(
      `These never stopped changing, so they may differ from run to run:\n${restless.map((entry) => `  ${entry.file}, at ${entry.restless}`).join("\n")}`,
    );
}
