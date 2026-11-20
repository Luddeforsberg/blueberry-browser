// Loaded into the app's main process by `drive` and `baseline`, so the same state gives the same picture every time.
// Only the test run loads it, like tests/background.cjs.
// - The clock starts at BLUEBERRY_DRIVE_NOW and runs from there, in main and in every page, so dates and "2 min ago"
//   come out the same. Only `Date` moves: timers and animation frames are left alone.
// - `Math.random` in main and every page starts from the same seed, so a new mascot's look is the same every time.
// - Pages ask for reduced motion. The scale of 1 is driver.ts's, at launch.
// - BLUEBERRY_DRIVE_HOSTS maps made-up hosts onto the local test server, so its random port never shows in an address.
// - Nothing loses focus. Nobody is at the computer during a drive, so a blur only comes from another program, or another
//   drive running beside this one, and it would close an open menu or panel before its picture is taken.
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const electron = require("electron");

const offset = Number(process.env.BLUEBERRY_DRIVE_NOW) - Date.now();

// The same in main and in the pages: the clock by a constant offset, so times saved in main and read in a page agree.
const steady = (by) => {
  // mulberry32, a small PRNG that's good enough for picking a look.
  let seed = 0x5eed;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const RealDate = globalThis.Date;
  class DriveDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + by);
      else super(...args);
    }
    static now() {
      return RealDate.now() + by;
    }
  }
  globalThis.Date = DriveDate;
};

if (Number.isFinite(offset)) {
  steady(offset);
  // Every frame of every page, before its own scripts, in the page's world rather than the preload's.
  const preload = join(mkdtempSync(join(tmpdir(), "blueberry-drive-")), "clock.js");
  writeFileSync(preload, `require("electron").contextBridge.executeInMainWorld({ func: ${steady.toString()}, args: [${offset}] });`);
  electron.app
    .whenReady()
    .then(() => electron.session.defaultSession.registerPreloadScript({ id: "drive-clock", type: "frame", filePath: preload }));
}

electron.app.commandLine.appendSwitch("force-prefers-reduced-motion");
electron.app.commandLine.appendSwitch("force-color-profile", "srgb");
if (process.env.BLUEBERRY_DRIVE_HOSTS) electron.app.commandLine.appendSwitch("host-resolver-rules", process.env.BLUEBERRY_DRIVE_HOSTS);

const withoutBlur = (on) =>
  function (event, listener) {
    return event === "blur" ? this : on.call(this, event, listener);
  };
electron.BaseWindow.prototype.on = withoutBlur(electron.BaseWindow.prototype.on);
electron.app.on("web-contents-created", (_, contents) => {
  contents.on = withoutBlur(contents.on);
});
