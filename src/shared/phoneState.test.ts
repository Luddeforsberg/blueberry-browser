import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MascotProfile } from "./library";
import { BERRY } from "./mascots";

// The phone page's own site/app/state.js, as the browser runs it, with a stand-in for sessionStorage.

const kept = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
  removeItem: (key: string) => void kept.delete(key),
});

const STATE = new URL("../../site/app/state.js", import.meta.url).href;
const phone = (await import(/* @vite-ignore */ STATE)) as {
  state: { mascots: MascotProfile[] };
  chosen: () => MascotProfile;
  choose: (mascot: MascotProfile) => void;
};

const SCOUT: MascotProfile = { ...BERRY, id: "scout", name: "Scout" };

describe("the mascot the phone's box talks to", () => {
  beforeEach(() => {
    kept.clear();
    phone.state.mascots = [BERRY, SCOUT];
  });

  it("is still the one chosen under the old key, which moves to the new one", () => {
    kept.set("blueberry.bird", "scout");
    expect(phone.chosen().id).toBe("scout");
    expect(kept.get("blueberry.mascot")).toBe("scout");
    expect(kept.has("blueberry.bird")).toBe(false);
  });

  it("keeps a choice under the new key, over one left under the old", () => {
    phone.choose(SCOUT);
    expect(kept.get("blueberry.mascot")).toBe("scout");
    expect(phone.chosen().id).toBe("scout");

    kept.set("blueberry.bird", BERRY.id);
    expect(phone.chosen().id).toBe("scout");
    expect(kept.has("blueberry.bird")).toBe(false);
  });

  it("is Berry with nothing chosen", () => {
    expect(phone.chosen().id).toBe(BERRY.id);
  });
});
