import { describe, expect, it } from "vitest";
import { IDLE, TIP_EDGE, TIP_GAP, TIP_HEIGHT, placeTip, slidesFrom, stepTip, type TipEvent, type TipState } from "./tooltipState";

const run = (events: TipEvent[], from: TipState = IDLE) => events.reduce((state, event) => stepTip(state, event).state, from);

describe("when a tooltip shows", () => {
  it("waits for the pointer to rest, then shows", () => {
    const entered = stepTip(IDLE, { type: "enter", id: "back", via: "pointer" });
    expect(entered.state.shown).toBeNull();
    expect(entered.timer).toBe("rest");
    expect(run([{ type: "rested" }], entered.state).shown).toBe("back");
  });

  it("shows at once for the keyboard", () => {
    const { state, timer } = stepTip(IDLE, { type: "enter", id: "back", via: "keyboard" });
    expect(state.shown).toBe("back");
    expect(timer).toBe("stop");
  });

  it("never shows after a press during the wait, even if the timer fires", () => {
    const state = run([{ type: "enter", id: "back", via: "pointer" }, { type: "press", id: "back" }, { type: "rested" }]);
    expect(state.shown).toBeNull();
    // The focus a press gives doesn't bring it back either.
    expect(run([{ type: "enter", id: "back", via: "keyboard" }], state).shown).toBeNull();
  });

  it("comes back after a press once the pointer has left and returned", () => {
    const state = run([
      { type: "enter", id: "back", via: "pointer" },
      { type: "press", id: "back" },
      { type: "leave", id: "back" },
      { type: "enter", id: "back", via: "pointer" },
      { type: "rested" },
    ]);
    expect(state.shown).toBe("back");
  });

  it("moves to a neighbour with no wait, and no blink between them", () => {
    const shown = run([{ type: "enter", id: "back", via: "pointer" }, { type: "rested" }]);
    const leaving = stepTip(shown, { type: "leave", id: "back" });
    expect(leaving.state.shown).toBe("back");
    expect(leaving.timer).toBe("grace");
    const moved = stepTip(leaving.state, { type: "enter", id: "forward", via: "pointer" });
    expect(moved.state).toMatchObject({ shown: "forward", leaving: false, waiting: null });
    // The grace that was counting for the one before is stopped, so it can't hide this one.
    expect(moved.timer).toBe("stop");
    expect(stepTip(moved.state, { type: "grace-over" }).state.shown).toBe("forward");
  });

  it("goes when the pointer leaves and nothing takes it over", () => {
    const state = run([
      { type: "enter", id: "back", via: "pointer" },
      { type: "rested" },
      { type: "leave", id: "back" },
      { type: "grace-over" },
    ]);
    expect(state.shown).toBeNull();
    // And the next one waits again.
    expect(stepTip(state, { type: "enter", id: "forward", via: "pointer" }).timer).toBe("rest");
  });

  it("goes at once when the pointer leaves the whole view", () => {
    const state = run([{ type: "enter", id: "back", via: "pointer" }, { type: "rested" }, { type: "leave", id: "back", now: true }]);
    expect(state.shown).toBeNull();
  });

  it("a leave from another control leaves the showing one alone", () => {
    const state = run([{ type: "enter", id: "back", via: "pointer" }, { type: "rested" }, { type: "leave", id: "reload" }]);
    expect(state).toMatchObject({ shown: "back", leaving: false });
  });

  it("goes on Escape or a scroll, and stays away while the pointer is still there", () => {
    const state = run([{ type: "enter", id: "back", via: "pointer" }, { type: "rested" }, { type: "dismiss" }]);
    expect(state.shown).toBeNull();
    expect(run([{ type: "enter", id: "back", via: "pointer" }, { type: "rested" }], state).shown).toBeNull();
  });

  it("a dismiss during the wait stops it showing", () => {
    const state = run([{ type: "enter", id: "back", via: "pointer" }, { type: "dismiss" }, { type: "rested" }]);
    expect(state.shown).toBeNull();
  });
});

describe("where a tooltip goes", () => {
  const room = { width: 1000, height: 700 };

  it("sits under its control, in the middle of it", () => {
    expect(placeTip({ x: 100, y: 8, width: 32, height: 32 }, 60, room)).toEqual({
      x: 86,
      y: 8 + 32 + TIP_GAP,
      width: 60,
      height: TIP_HEIGHT,
    });
  });

  it("goes over it when there is no room under", () => {
    const control = { x: 100, y: 650, width: 32, height: 32 };
    const { y } = placeTip(control, 60, room);
    expect(y).toBe(650 - TIP_GAP - TIP_HEIGHT);
    expect(y + TIP_HEIGHT).toBeLessThanOrEqual(control.y);
  });

  it("stays under when the room under only just fits", () => {
    const control = { x: 100, y: room.height - TIP_EDGE - TIP_HEIGHT - TIP_GAP - 32, width: 32, height: 32 };
    expect(placeTip(control, 60, room).y).toBe(control.y + 32 + TIP_GAP);
    expect(placeTip({ ...control, y: control.y + 1 }, 60, room).y).toBe(control.y + 1 - TIP_GAP - TIP_HEIGHT);
  });

  it("is never wider than the window", () => {
    const wide = placeTip({ x: 100, y: 8, width: 32, height: 32 }, 5000, room);
    expect(wide).toMatchObject({ x: TIP_EDGE, width: room.width - 2 * TIP_EDGE });
    expect(placeTip({ x: 100, y: 8, width: 32, height: 32 }, room.width - 2 * TIP_EDGE, room).width).toBe(room.width - 2 * TIP_EDGE);
  });

  it("is kept inside the window at both sides, without covering the control", () => {
    expect(placeTip({ x: 0, y: 8, width: 32, height: 32 }, 120, room).x).toBe(TIP_EDGE);
    const right = placeTip({ x: 980, y: 8, width: 20, height: 32 }, 120, room);
    expect(right.x + right.width).toBe(room.width - TIP_EDGE);
    expect(right.y).toBeGreaterThanOrEqual(8 + 32);
  });
});

describe("whether it slides", () => {
  const at = (x: number, y = 47) => ({ x, y, width: 60, height: TIP_HEIGHT });
  it("slides between neighbours", () => expect(slidesFrom(at(100), at(140))).toBe(true));
  it("appears in place the first time", () => expect(slidesFrom(null, at(140))).toBe(false));
  it("appears in place across the window", () => expect(slidesFrom(at(100), at(900))).toBe(false));
});
