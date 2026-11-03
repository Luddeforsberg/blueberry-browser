import { describe, expect, it } from "vitest";
import { mascotFromArgs, mascotFromLink } from "./mascotLink";

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
    for (const id of ["", "berry", "starter-morning-paper", ID.slice(0, -1), `${ID.slice(0, -1)}g`, ID.replaceAll("-", ""), "../../etc/passwd"]) {
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
