import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "../main/SettingsStore";
import { firstJobRows, firstJobsFor, firstRunStart, firstRunSteps } from "./firstRun";

describe("the first run", () => {
  it("asks for an account only with a server, and about history only with a browser to bring it from", () => {
    expect(firstRunSteps({ accounts: true, browsers: true })).toEqual(["meet", "account", "yours", "brain", "history", "see"]);
    expect(firstRunSteps({ accounts: false, browsers: false })).toEqual(["meet", "yours", "brain", "see"]);
  });

  it("starts again at the first step that isn't done", () => {
    const steps = firstRunSteps({ accounts: true, browsers: true });
    const at = (passed: Parameters<typeof firstRunStart>[1]["passed"], signedIn = false, hasKey = false) =>
      steps[firstRunStart(steps, { passed, signedIn, hasKey })];
    expect(at([])).toBe("meet");
    expect(at(["meet"])).toBe("account");
    expect(at(["meet"], true)).toBe("yours");
    expect(at(["meet", "yours"], true)).toBe("brain");
    expect(at(["meet", "yours"], true, true)).toBe("history");
    // Put off, the key counts as done.
    expect(at(["meet", "yours", "brain", "history"], true)).toBe("see");
    // An account made stays made, so having passed it doesn't count without being signed in.
    expect(at(["meet", "yours", "brain", "history"])).toBe("account");
  });
});

describe("First jobs", () => {
  it("puts a key first only when it was put off, and history only with a browser", () => {
    expect(firstJobsFor({ hasKey: false, browsers: true })).toEqual(["key", "history", "try", "meet"]);
    expect(firstJobsFor({ hasKey: true, browsers: false })).toEqual(["try", "meet"]);
  });

  it("shows each row done or not, and nothing once every row is done", () => {
    expect(firstJobRows(["history", "try", "meet"], ["history"])).toEqual([
      { job: "history", done: true },
      { job: "try", done: false },
      { job: "meet", done: false },
    ]);
    expect(firstJobRows(["try", "meet"], ["meet", "try", "key"])).toEqual([]);
    expect(firstJobRows([], [])).toEqual([]);
  });

  it("keeps only known rows and steps in Settings, once each and in order", () => {
    const settings = sanitizeSettings({
      firstJobs: ["meet", "nonsense", "try", "meet"],
      firstJobsDone: "try",
      firstRun: ["yours", "meet", 3],
    });
    expect(settings.firstJobs).toEqual(["try", "meet"]);
    expect(settings.firstJobsDone).toEqual([]);
    expect(settings.firstRun).toEqual(["meet", "yours"]);
  });
});
