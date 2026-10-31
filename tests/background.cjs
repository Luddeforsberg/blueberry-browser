/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-empty-function */
// Loaded into the test app's main process, so test runs don't take over the developer's screen.
// The window opens far off-screen and the app never becomes the active one, with no Dock icon.
// Sampled during a run with `lsappinfo front`, which is how to check this still holds.
// Tests drive it over the debugging connection, so they need neither the real pointer nor focus.
const Module = require("node:module");
const electron = require("electron");

const OFF_SCREEN = { x: -20000, y: -20000 };

class BackgroundWindow extends electron.BaseWindow {
  constructor(options) {
    super({ ...options, ...OFF_SCREEN, enableLargerThanScreen: true, show: false });
    this.showInactive();
  }

  // Showing or focusing a window normally brings its app to the front.
  show() {
    this.showInactive();
  }

  focus() {}
}

// A test run has nobody to notify, and an app that never comes to the front would notify every time.
class NoNotification {
  static isSupported() {
    return false;
  }
}

const REPLACED = { BaseWindow: BackgroundWindow, Notification: NoNotification };

const wrapped = new Proxy(electron, {
  get: (target, key) => REPLACED[key] ?? target[key],
});

const load = Module._load;
Module._load = function (request, ...rest) {
  return request === "electron" ? wrapped : load.call(this, request, ...rest);
};

if (process.platform === "darwin") electron.app.setActivationPolicy("accessory");
