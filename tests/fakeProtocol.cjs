/* eslint-disable @typescript-eslint/no-require-imports */
// Tests mustn't make the Electron they run the Mac's handler for `blueberry://`, so registering only goes in this list.
// A test delivers a link the way the system would, by emitting `open-url` or `second-instance` on the app.
const electron = require("electron");

globalThis.fakeProtocols = [];
electron.app.setAsDefaultProtocolClient = (protocol, ...rest) => {
  globalThis.fakeProtocols.push([protocol, ...rest]);
  return true;
};
