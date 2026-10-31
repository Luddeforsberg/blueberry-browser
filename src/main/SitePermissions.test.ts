import { EventEmitter } from "events";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { CHANNEL_REGIONS } from "./ipc";
import { SitePermissions } from "./SitePermissions";

const SITE = "https://example.com";

class FakeContents extends EventEmitter {
  constructor(public url = `${SITE}/page`) {
    super();
  }
  getURL = () => this.url;
}

const setup = () => {
  const file = join(mkdtempSync(join(tmpdir(), "blueberry-permissions-")), "site-permissions.json");
  return { file, permissions: new SitePermissions(file), tab: new FakeContents() };
};

const asked = (permission = "geolocation", extra = {}) => ({ requestingUrl: `${SITE}/page`, ...extra, permission });

const flush = () => new Promise((resolve) => setImmediate(resolve));

// What the request settled to so far: true, false, or "waiting".
const watch = (promise: Promise<boolean>) => {
  const state: { value: boolean | "waiting" } = { value: "waiting" };
  void promise.then((value) => (state.value = value));
  return state;
};

describe("SitePermissions", () => {
  it("doesn't grant anything until the user answers, and remembers the answer", async () => {
    const { permissions, tab, file } = setup();
    const request = watch(permissions.request(tab, "geolocation", asked()));
    await flush();
    expect(request.value).toBe("waiting");
    expect(permissions.check(tab, "geolocation", SITE, {})).toBe(false);

    const prompt = permissions.promptFor(tab);
    expect(prompt).toMatchObject({ origin: SITE, permissions: ["location"] });
    permissions.decide(prompt!.id, true);
    await flush();
    expect(request.value).toBe(true);
    expect(permissions.check(tab, "geolocation", SITE, {})).toBe(true);
    expect(permissions.promptFor(tab)).toBeNull();
    expect(await permissions.request(tab, "geolocation", asked())).toBe(true);

    const restarted = new SitePermissions(file);
    expect(restarted.saved).toEqual([{ origin: SITE, permission: "location", decision: "allow" }]);
    expect(restarted.check(null, "geolocation", SITE, {})).toBe(true);
  });

  it("remembers a block, without asking again", async () => {
    const { permissions, tab } = setup();
    const request = permissions.request(tab, "notifications", asked());
    permissions.decide(permissions.promptFor(tab)!.id, false);
    expect(await request).toBe(false);
    expect(await permissions.request(tab, "notifications", asked())).toBe(false);
    expect(permissions.promptFor(tab)).toBeNull();
    expect(permissions.check(tab, "notifications", SITE, {})).toBe(false);
  });

  it.each(["hid", "serial", "usb", "nfc", "smart-card", "web-printing", "unknown", "something-new"])(
    "refuses %s without asking",
    async (permission) => {
      const { permissions, tab } = setup();
      expect(await permissions.request(tab, permission, asked())).toBe(false);
      expect(permissions.promptFor(tab)).toBeNull();
      expect(permissions.check(tab, permission, SITE, {})).toBe(false);
    }
  );

  it.each(["geolocation", "notifications", "midi", "midiSysex", "display-capture", "clipboard-read", "openExternal"])(
    "asks about %s",
    async (permission) => {
      const { permissions, tab } = setup();
      void permissions.request(tab, permission, asked());
      expect(permissions.promptFor(tab)).not.toBeNull();
      expect(permissions.check(tab, permission, SITE, {})).toBe(false);
    }
  );

  it("lets ordinary web features through in both handlers, for any page", async () => {
    const { permissions } = setup();
    const page = new FakeContents("file:///page.html");
    expect(await permissions.request(page, "fullscreen", { requestingUrl: "file:///page.html" })).toBe(true);
    expect(permissions.check(page, "clipboard-sanitized-write", "file:///", {})).toBe(true);
  });

  it("asks about camera and microphone separately from what's already answered", async () => {
    const { permissions, tab } = setup();
    permissions.set(SITE, "microphone", "allow");
    const both = permissions.request(tab, "media", asked("media", { mediaTypes: ["video", "audio"] }));
    expect(permissions.promptFor(tab)?.permissions).toEqual(["camera"]);
    permissions.decide(permissions.promptFor(tab)!.id, true);
    expect(await both).toBe(true);

    expect(permissions.check(tab, "media", SITE, { mediaType: "video" })).toBe(true);
    permissions.set(SITE, "camera", "block");
    expect(permissions.check(tab, "media", SITE, { mediaType: "video" })).toBe(false);
    expect(permissions.check(tab, "media", SITE, { mediaType: "audio" })).toBe(true);
    expect(permissions.check(tab, "media", SITE, { mediaType: "unknown" })).toBe(false);
    expect(await permissions.request(tab, "media", asked("media", { mediaTypes: ["video", "audio"] }))).toBe(false);
  });

  it("refuses a waiting request when part of it already allowed gets blocked", async () => {
    const { permissions, tab } = setup();
    permissions.set(SITE, "microphone", "allow");
    const both = permissions.request(tab, "media", asked("media", { mediaTypes: ["video", "audio"] }));
    permissions.set(SITE, "microphone", "block");
    expect(await both).toBe(false);
    expect(permissions.promptFor(tab)).toBeNull();
  });

  it("still refuses a blocked part when another request is waiting on the same question", async () => {
    const { permissions, tab } = setup();
    permissions.set(SITE, "camera", "allow");
    const microphone = permissions.request(tab, "media", asked("media", { mediaTypes: ["audio"] }));
    const both = permissions.request(tab, "media", asked("media", { mediaTypes: ["video", "audio"] }));
    permissions.set(SITE, "camera", "block");
    permissions.decide(permissions.promptFor(tab)!.id, true);
    expect(await microphone).toBe(true);
    expect(await both).toBe(false);
  });

  it("asks about both when a media request doesn't say which", () => {
    const { permissions, tab } = setup();
    void permissions.request(tab, "media", asked("media", { mediaTypes: [] }));
    expect(permissions.promptFor(tab)?.permissions).toEqual(["camera", "microphone"]);
  });

  it("never gives a site lasting access to the screen or other apps, but remembers a block", async () => {
    for (const permission of ["display-capture", "openExternal"]) {
      const { permissions, tab } = setup();
      const allowed = permissions.request(tab, permission, asked());
      permissions.decide(permissions.promptFor(tab)!.id, true);
      expect(await allowed).toBe(true);
      expect(permissions.saved).toEqual([]);
      expect(permissions.check(tab, permission, SITE, {})).toBe(false);

      const blocked = permissions.request(tab, permission, asked());
      permissions.decide(permissions.promptFor(tab)!.id, false);
      expect(await blocked).toBe(false);
      expect(await permissions.request(tab, permission, asked())).toBe(false);
    }
  });

  it("won't save a lasting allow for those from Settings or a tampered file either", () => {
    const { permissions, file } = setup();
    expect(permissions.set(SITE, "screen", "allow")).toBe(false);
    writeFileSync(file, JSON.stringify([{ origin: SITE, permission: "screen", decision: "allow" }]));
    expect(new SitePermissions(file).saved).toEqual([]);
  });

  it("refuses frames from another site and anything that isn't a site, without asking", async () => {
    const { permissions, tab } = setup();
    for (const requestingUrl of ["https://ads.example.net/", "about:srcdoc", "data:text/html,x", "file:///x", ""]) {
      expect(await permissions.request(tab, "geolocation", { requestingUrl })).toBe(false);
    }
    expect(permissions.promptFor(tab)).toBeNull();

    permissions.set("https://ads.example.net", "location", "allow");
    expect(permissions.check(tab, "geolocation", "https://ads.example.net", { embeddingOrigin: `${SITE}/` })).toBe(false);
    expect(permissions.check(null, "geolocation", "https://ads.example.net", {})).toBe(true);
  });

  it("keeps a decision to its exact origin", () => {
    const { permissions } = setup();
    permissions.set(SITE, "location", "allow");
    for (const other of ["http://example.com", "https://example.com:8443", "https://www.example.com"]) {
      expect(permissions.check(null, "geolocation", other, {})).toBe(false);
    }
  });

  it("refuses without saving when the page navigates away or the tab closes", async () => {
    for (const event of ["did-navigate", "destroyed"]) {
      const { permissions, tab } = setup();
      const request = permissions.request(tab, "geolocation", asked());
      tab.emit(event);
      expect(await request).toBe(false);
      expect(permissions.promptFor(tab)).toBeNull();
      expect(permissions.saved).toEqual([]);
    }
  });

  it("keeps each tab's requests to that tab, and one answer settles the site's others", async () => {
    const { permissions, tab } = setup();
    const other = new FakeContents();
    const first = permissions.request(tab, "geolocation", asked());
    const second = permissions.request(other, "geolocation", asked());
    expect(permissions.promptFor(new FakeContents())).toBeNull();
    expect(permissions.promptFor(other)).not.toBeNull();
    permissions.decide(permissions.promptFor(tab)!.id, true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(permissions.promptFor(other)).toBeNull();
  });

  it("shows one prompt for a page repeating the same request", async () => {
    const { permissions, tab } = setup();
    const requests = [1, 2, 3].map(() => permissions.request(tab, "notifications", asked()));
    const { id } = permissions.promptFor(tab)!;
    permissions.decide(id, false);
    expect(permissions.promptFor(tab)).toBeNull();
    expect(await Promise.all(requests)).toEqual([false, false, false]);
  });

  it("gives each request for the screen its own answer, so one Allow can't cover two", async () => {
    const { permissions, tab } = setup();
    const first = watch(permissions.request(tab, "display-capture", asked()));
    const second = watch(permissions.request(tab, "display-capture", asked()));
    permissions.decide(permissions.promptFor(tab)!.id, true);
    await flush();
    expect(first.value).toBe(true);
    expect(second.value).toBe("waiting");
    permissions.decide(permissions.promptFor(tab)!.id, false);
    await flush();
    expect(second.value).toBe(false);
  });

  it("lets Settings change, forget and settle answers, and refuses anything invalid", async () => {
    const { permissions, tab, file } = setup();
    const waiting = permissions.request(tab, "geolocation", asked());
    expect(permissions.set(SITE, "location", "block")).toBe(true);
    expect(await waiting).toBe(false);

    expect(permissions.set(SITE, "location", "allow")).toBe(true);
    expect(permissions.check(tab, "geolocation", SITE, {})).toBe(true);
    expect(permissions.set(SITE, "location", null)).toBe(true);
    expect(permissions.check(tab, "geolocation", SITE, {})).toBe(false);
    expect(permissions.set(SITE, "location", null)).toBe(false);
    expect(new SitePermissions(file).saved).toEqual([]);

    expect(permissions.set(`${SITE}/path`, "location", "allow")).toBe(false);
    expect(permissions.set("file://", "location", "allow")).toBe(false);
    expect(permissions.set("__proto__", "location", "allow")).toBe(false);
    expect(permissions.set(SITE, "everything" as never, "allow")).toBe(false);
    expect(permissions.set(SITE, "location", "maybe" as never)).toBe(false);
    expect(permissions.saved).toEqual([]);
  });

  it("does nothing for an answer to a prompt that's gone", () => {
    const { permissions } = setup();
    expect(permissions.decide("nobody", true)).toBe(false);
  });

  it("only lets the prompt view answer, so neither pages, the chrome nor Berry's tools can", () => {
    expect(CHANNEL_REGIONS["permissions:decide"]).toEqual(["prompt"]);
    expect(CHANNEL_REGIONS["permissions:current"]).toEqual(["prompt"]);
  });
});
