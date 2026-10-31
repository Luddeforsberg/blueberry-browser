/* eslint-disable @typescript-eslint/no-require-imports */
// Tests mustn't ask the Mac's keychain for anything, which can raise a dialog. Marked, so a test can see the token
// was never saved as it was typed.
const Module = require("node:module");
const electron = require("electron");

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`sealed:${Buffer.from(text).toString("hex")}`),
  decryptString: (data) => Buffer.from(data.toString().slice("sealed:".length), "hex").toString(),
};

const wrapped = new Proxy(electron, {
  get: (target, key) => (key === "safeStorage" ? safeStorage : target[key]),
});

const load = Module._load;
Module._load = function (request, ...rest) {
  return request === "electron" ? wrapped : load.call(this, request, ...rest);
};
