import { describe, expect, it } from "vitest";
import { FLOOD_LINKS, FLOOD_MS, FORWARD_MS, linkThrottle, mascotFromArgs, mascotFromLink, QUIET_MS, REPEAT_MS } from "./mascotLink";

const ID = "3f2b8c1e-6d4a-4b7e-9c2f-1a5e8d7b6c40";

describe("mascotFromLink", () => {
  it("reads the one form, and nothing else", () => {
    expect(mascotFromLink(`blueberry://mascot/${ID}`)).toBe(ID);
    expect(mascotFromLink(`blueberry://mascot/${ID.toUpperCase()}`)).toBe(ID);
  });

  it("ignores other hosts, paths, queries and fragments", () => {
    for (const link of [
      `blueberry://routine/${ID}`,
      `blueberry://mascot-gallery/${ID}`,
      `blueberry://settings`,
      `blueberry://mascot/${ID}/`,
      `blueberry://mascot/${ID}/add`,
      `blueberry://mascot/${ID}?add=1`,
      `blueberry://mascot/${ID}#run`,
      `blueberry://mascot//${ID}`,
      `blueberry:mascot/${ID}`,
      `BLUEBERRY://MASCOT/${ID}`,
      `blueberry://user@mascot/${ID}`,
      `https://blueberry-flock.netlify.app/m/?id=${ID}`,
      ` blueberry://mascot/${ID}`,
    ]) expect(mascotFromLink(link), link).toBeNull();
  });

  it("ignores anything that isn't a uuid", () => {
    for (const id of ["", "berry", "starter-meeting-prep", ID.slice(0, -1), `${ID.slice(0, -1)}g`, ID.replaceAll("-", ""), "../../etc/passwd"]) {
      expect(mascotFromLink(`blueberry://mascot/${id}`), id).toBeNull();
    }
  });

  it("ignores script-like and very long input", () => {
    expect(mascotFromLink("javascript:alert(1)")).toBeNull();
    expect(mascotFromLink(`blueberry://mascot/javascript:alert(1)//${"a".repeat(18)}`)).toBeNull();
    expect(mascotFromLink(`blueberry://mascot/${ID}%0d%0a`)).toBeNull();
    expect(mascotFromLink(`blueberry://mascot/${ID}${"0".repeat(100_000)}`)).toBeNull();
    expect(mascotFromLink(`blueberry://mascot/${"a".repeat(100_000)}`)).toBeNull();
  });

  it("ignores what isn't a string", () => {
    for (const value of [undefined, null, 1, {}, [`blueberry://mascot/${ID}`], { toString: () => `blueberry://mascot/${ID}` }]) {
      expect(mascotFromLink(value)).toBeNull();
    }
  });
});

describe("mascotFromArgs", () => {
  it("finds the link among a second copy's arguments", () => {
    expect(mascotFromArgs(["C:\\Blueberry\\blueberry-browser.exe", "--allow-file-access-from-files", `blueberry://mascot/${ID}`])).toBe(ID);
  });

  it("finds nothing when there's no good link", () => {
    expect(mascotFromArgs([])).toBeNull();
    expect(mascotFromArgs(["/usr/bin/electron", ".", `blueberry://mascot/${ID}?x`, `--url=blueberry://mascot/${ID}`])).toBeNull();
  });
});

describe("linkThrottle", () => {
  const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const clock = () => {
    let now = 1_000_000;
    return { now: () => now, wait: (ms: number) => (now += ms) };
  };

  it("opens the first link and brings the window forward", () => {
    const time = clock();
    expect(linkThrottle(time.now)(ID)).toEqual({ open: true, forward: true });
  });

  it("drops the same id again while it keeps coming, then opens it once it stops", () => {
    const time = clock();
    const allow = linkThrottle(time.now);
    allow(ID);
    for (let at = 0; at < 10; at++) {
      time.wait(REPEAT_MS - 1);
      expect(allow(ID)).toEqual({ open: false, forward: false });
    }
    time.wait(REPEAT_MS);
    expect(allow(ID)).toEqual({ open: true, forward: true });
  });

  it("ignores every link for a while once a few have come close together, whatever the ids", () => {
    const time = clock();
    const allow = linkThrottle(time.now);
    let opened = 0;
    let forward = 0;
    // Two ids taking turns, as fast as a page can, for ten seconds.
    for (let at = 0; at < 1000; at++) {
      const result = allow(at % 2 ? ID : OTHER);
      opened += result.open ? 1 : 0;
      forward += result.forward ? 1 : 0;
      time.wait(10);
    }
    expect(opened).toBe(FLOOD_LINKS);
    expect(forward).toBe(1);
    // Ids that aren't in the Gallery count the same, and the quiet lasts its whole length from the third link, at 20ms.
    expect(allow("00000000-0000-4000-8000-000000000000").open).toBe(false);
    time.wait(QUIET_MS + 20 - 10_000 - 1);
    expect(allow(OTHER).open).toBe(false);
    time.wait(1);
    expect(allow(OTHER)).toEqual({ open: true, forward: true });
  });

  it("lets links through again once they're spread out", () => {
    const time = clock();
    const allow = linkThrottle(time.now);
    for (let at = 0; at < 10; at++) {
      expect(allow(at % 2 ? ID : OTHER).open).toBe(true);
      time.wait(FLOOD_MS / (FLOOD_LINKS - 1));
    }
  });

  it("opens a different id, but comes forward at most once a while", () => {
    const time = clock();
    const allow = linkThrottle(time.now);
    allow(ID);
    time.wait(FORWARD_MS - 1);
    expect(allow(OTHER)).toEqual({ open: true, forward: false });
    time.wait(1);
    expect(allow(ID)).toEqual({ open: true, forward: true });
  });
});
