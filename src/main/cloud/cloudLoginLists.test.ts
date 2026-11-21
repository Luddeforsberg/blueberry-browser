import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CloudLogins, MAX_PROJECTS, type CookieJar, type StoredCookie } from "./cloudLogins";

// The list of sign-ins on disk: one list for each project, and the one list from before there was one per project.

const A = "browserbase:a";
const B = "browserbase:b";
const OLD_LIST = [{ site: "example.com", addedAt: 5, checkedAt: null, status: "checked" }];

const fileWith = (data: unknown): string => {
  const file = join(mkdtempSync(join(tmpdir(), "cloud-logins-")), "cloud-logins.json");
  writeFileSync(file, JSON.stringify(data));
  return file;
};

// Logins whose cloud browser is the one for `at.origin`, the same one every time as `CloudSessions` is, with a cookie
// jar that holds nothing.
const loginsAt = (file: string, upgradeTo: string[] | null, at: { origin: string }, cookies: StoredCookie[] = []) => {
  const jar: CookieJar = { addCookies: async () => {}, clearCookies: async () => {} };
  const browser = {
    account: {},
    get origin() {
      return at.origin;
    },
    withContext: <T>(act: (one: CookieJar) => Promise<T>) => act(jar),
  };
  const confirm = vi.fn(async () => true);
  const logins = new CloudLogins(file, { jar: () => browser, confirm, readCookies: async () => cookies, onChange: () => {} }, upgradeTo);
  return { logins, confirm };
};
const sites = (logins: CloudLogins) => logins.logins.map(({ site }) => site);

describe("the list of sign-ins on disk", () => {
  it("gives the one list from before to the project whose Context came with it, and keeps it as that project's at once", () => {
    const file = fileWith(OLD_LIST);
    const at = { origin: A };
    expect(sites(loginsAt(file, [A], at).logins)).toEqual(["example.com"]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ projects: { [A]: [expect.objectContaining({ site: "example.com" })] } });
    // Read again when the projects it may be in are others, it stays A's, and only A's.
    expect(sites(loginsAt(file, [B], at).logins)).toEqual(["example.com"]);
    at.origin = B;
    expect(sites(loginsAt(file, [B], at).logins)).toEqual([]);
  });

  it("lists it under every project it may be in, so forgetting all on one leaves it under another", async () => {
    const file = fileWith(OLD_LIST);
    const at = { origin: B };
    const { logins } = loginsAt(file, [A, B], at);
    expect(sites(logins)).toEqual(["example.com"]);
    expect(await logins.forgetAll()).toBeNull();
    expect(sites(logins)).toEqual([]);
    at.origin = A;
    expect(sites(logins)).toEqual(["example.com"]);
  });

  it("decides nothing, and writes nothing, while the cloud's files can't be read", async () => {
    const file = fileWith(OLD_LIST);
    const { logins } = loginsAt(file, null, { origin: A });
    expect(sites(logins)).toEqual([]);
    await logins.forgetAll();
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(OLD_LIST);
  });

  it("keeps a sign-in brought along once the files can be read and the list from before is decided", async () => {
    const file = fileWith(OLD_LIST);
    const { logins } = loginsAt(file, null, { origin: A }, [{ name: "sid", value: "v", domain: "github.com", path: "/" }]);
    logins.load([A]);
    expect(await logins.bring("github.com")).toBeNull();
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      projects: { [A]: [expect.objectContaining({ site: "github.com" }), expect.objectContaining({ site: "example.com" })] },
    });
  });

  it(`reads every project's list, and takes a new project's only while fewer than ${MAX_PROJECTS} have one`, async () => {
    const many = Object.fromEntries(Array.from({ length: MAX_PROJECTS + 20 }, (_, index) => [`browserbase:p${index}`, OLD_LIST]));
    const file = fileWith({ projects: many });
    const at = { origin: `browserbase:p${MAX_PROJECTS + 19}` };
    expect(sites(loginsAt(file, [], at).logins)).toEqual(["example.com"]);
    at.origin = "browserbase:new";
    const { logins, confirm } = loginsAt(file, [], at);
    expect(await logins.bring("example.com")).toMatch(/kept for 100 projects already/);
    expect(confirm).not.toHaveBeenCalled();
  });
});
