// Loaded into the app's main process by `drive` and `baseline`, so the same state gives the same picture every time.
// Only the test run loads it, like tests/background.cjs.
// - The clock starts at BLUEBERRY_DRIVE_NOW and runs from there, in main and in every page, so dates and "2 min ago"
//   come out the same. Only `Date` moves: timers and animation frames are left alone.
// - Pages ask for reduced motion, and are drawn at a scale of 1 whatever the screen, so pictures are the same size.
// - BLUEBERRY_DRIVE_HOSTS maps made-up hosts onto the local test server, so its random port never shows in an address.
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const electron = require("electron");

const offset = Number(process.env.BLUEBERRY_DRIVE_NOW) - Date.now();

// The same in main and in the pages: a constant offset, so times saved in main and read in a page agree.
const shiftClock = (by) => {
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
  shiftClock(offset);
  // Every frame of every page, before its own scripts, in the page's world rather than the preload's.
  const preload = join(mkdtempSync(join(tmpdir(), "blueberry-drive-")), "clock.js");
  writeFileSync(
    preload,
    `require("electron").contextBridge.executeInMainWorld({ func: ${shiftClock.toString()}, args: [${offset}] });`
  );
  electron.app.whenReady().then(() => electron.session.defaultSession.registerPreloadScript({ id: "drive-clock", type: "frame", filePath: preload }));
}

electron.app.commandLine.appendSwitch("force-prefers-reduced-motion");
electron.app.commandLine.appendSwitch("force-device-scale-factor", "1");
electron.app.commandLine.appendSwitch("force-color-profile", "srgb");
if (process.env.BLUEBERRY_DRIVE_HOSTS) electron.app.commandLine.appendSwitch("host-resolver-rules", process.env.BLUEBERRY_DRIVE_HOSTS);
