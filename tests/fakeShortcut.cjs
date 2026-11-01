/* eslint-disable @typescript-eslint/no-require-imports */
// Tests mustn't take a key away from whoever is at the computer, so a global shortcut only goes in this list, and
// `globalThis.fakeShortcuts` is how a test presses one.
const Module = require("node:module");
const electron = require("electron");

const shortcuts = new Map();
globalThis.fakeShortcuts = shortcuts;

const globalShortcut = {
  register: (accelerator, callback) => {
    shortcuts.set(accelerator, callback);
    return true;
  },
  unregister: (accelerator) => shortcuts.delete(accelerator),
  unregisterAll: () => shortcuts.clear(),
};

const wrapped = new Proxy(electron, {
  get: (target, key) => (key === "globalShortcut" ? globalShortcut : target[key]),
});

const load = Module._load;
Module._load = function (request, ...rest) {
  return request === "electron" ? wrapped : load.call(this, request, ...rest);
};
