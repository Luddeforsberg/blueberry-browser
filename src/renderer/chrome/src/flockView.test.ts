import { beforeEach, describe, expect, it, vi } from "vitest";

// The view lives in the module, so each test gets a fresh one.
const load = async () => {
  vi.resetModules();
  vi.stubGlobal("window", new EventTarget());
  return import("./flockView");
};

describe("which view a Flock tab opens on", () => {
  let view: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => {
    view = await load();
  });

  const intoForm = () => {
    view.setFlockShowing(true);
    view.setFlockView({ page: "form", values: view.blankMascot() });
    view.setFlockShowing(false);
  };

  it("opens on the list the first time", () => {
    expect(view.flockViewFor("tab-1")).toEqual({ page: "list" });
  });

  it("keeps a form going while the same Flock tab is away and back", () => {
    view.flockViewFor("tab-1");
    intoForm();
    expect(view.flockViewFor("tab-1").page).toBe("form");
  });

  it("opens a new Flock tab on the list, not where the last one was", () => {
    view.flockViewFor("tab-1");
    intoForm();
    expect(view.flockViewFor("tab-2")).toEqual({ page: "list" });
  });

  it("shows what was set from elsewhere in whichever Flock tab opens for it", () => {
    view.flockViewFor("tab-1");
    intoForm();
    view.setFlockView({ page: "memory", mascotId: "m1" });
    expect(view.flockViewFor("tab-2")).toEqual({ page: "memory", mascotId: "m1" });
    // And it's that tab's own from then on.
    expect(view.flockViewFor("tab-2")).toEqual({ page: "memory", mascotId: "m1" });
  });

  it("keeps a view set from elsewhere while a Flock page is showing in that tab", () => {
    view.flockViewFor("tab-1");
    view.setFlockShowing(true);
    view.setFlockView({ page: "memory", mascotId: "m1" });
    expect(view.flockViewFor("tab-1")).toEqual({ page: "memory", mascotId: "m1" });
  });
});
