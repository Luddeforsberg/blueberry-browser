import { describe, expect, it } from "vitest";
import { settingsBack, settingsPlace } from "./settingsPlaces";

describe("settingsPlace", () => {
  it("lands each old section name in its new place", () => {
    expect(settingsPlace("Appearance")).toEqual({ section: "general", page: null });
    expect(settingsPlace("Downloads")).toEqual({ section: "general", page: null });
    expect(settingsPlace("Berry")).toEqual({ section: "mascots", page: null });
    expect(settingsPlace("Data and privacy")).toEqual({ section: "privacy", page: null });
    expect(settingsPlace("Site permissions")).toEqual({ section: "privacy", page: "site-permissions" });
    expect(settingsPlace("Phone")).toEqual({ section: "connections", page: "phone" });
    expect(settingsPlace("Claude")).toEqual({ section: "connections", page: "claude" });
    expect(settingsPlace("Cloud")).toEqual({ section: "connections", page: "cloud" });
    expect(settingsPlace("Account")).toEqual({ section: "account", page: null });
  });

  it("reads the new names", () => {
    expect(settingsPlace("connections")).toEqual({ section: "connections", page: null });
    expect(settingsPlace("what-leaves")).toEqual({ section: "privacy", page: "what-leaves" });
  });

  it("leaves Settings where it is for nothing or a name nobody knows", () => {
    expect(settingsPlace(null)).toBeNull();
    expect(settingsPlace("")).toBeNull();
    expect(settingsPlace("toString")).toBeNull();
    expect(settingsPlace("cloud ")).toBeNull();
  });
});

describe("settingsBack", () => {
  it("goes back from a page one step in to its section, and nowhere from a section", () => {
    expect(settingsBack("cloud")).toBe("connections");
    expect(settingsBack("Site permissions")).toBe("privacy");
    expect(settingsBack("privacy")).toBeNull();
    expect(settingsBack(null)).toBeNull();
  });
});
