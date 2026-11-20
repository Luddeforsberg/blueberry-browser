// Members no import rule sees: who may take a page's pixels, send input to a page or past a tab held for the user, and
// what the mascot on the desktop never touches. Each check refuses any reference to the members it names outside the
// files it allows: a call, `.bind`, a literal `["name"]`, destructuring `{ name }`, or importing `{ name }`. A name held
// in a variable, or a member read through a type of its own, gets past it. Where a name is also
// used for something unrelated, `declaredIn` narrows it, with types, to the member that file declares. No check sees
// where an allowed caller sends what it gets, so docs/ARCHITECTURE.md says that.
//
// Like eslint.fences.mjs, each check is a rule of its own, so checks don't undo each other or the rules
// eslint.boundaries.mjs sets. Every file named here must exist, so a rename can't quietly turn a check off.

import { existsSync } from "node:fs";

const APP = ["src/main/**/*.{ts,tsx}", "runner/src/**/*.ts"];
const main = (...paths) => paths.map((p) => `src/main/${p}`);

// The desktop mascot's own renderer files, helpers too, by name in any folder, so a new or moved one is held from the
// start. Shared components it borrows from the chrome are outside this check.
const DESKTOP_RENDERER = ["src/renderer/chrome/src/**/{Desktop,desktop,useDesktop}*.{ts,tsx}"];

const checks = [
  {
    name: "capture",
    in: APP,
    allowed: main("tabs/Tab.ts", "tabs/TabPage.ts"),
    members: ["capturePage"],
    message: "A page's pixels are taken in Tab alone. Only tabs/Tab.ts and tabs/TabPage.ts may use capturePage.",
  },
  {
    name: "picture",
    in: APP,
    allowed: main("window/WorkViews.ts", "tabs/TabPreviews.ts"),
    members: ["picture"],
    declaredIn: "src/main/tabs/Tab.ts",
    message:
      "Tab.picture keeps the mascot in, so it goes to the working view and tab previews alone, never a tool, a chat or the disk. Only window/WorkViews.ts and tabs/TabPreviews.ts may use it.",
  },
  {
    name: "held",
    in: APP,
    allowed: main("tabs/Tab.ts", "phone/codeEntry.ts"),
    members: ["sendInputWhileHeld"],
    message: "Nothing gets past the hold on a tab handed to the user but a code from the phone, typed by phone/codeEntry.ts through Tab.",
  },
  {
    name: "input",
    in: APP,
    allowed: main("tabs/TabPage.ts"),
    members: ["sendInputEvent"],
    message:
      "Input reaches a page through Tab, which refuses it while the tab is held for the user. Only tabs/TabPage.ts may use sendInputEvent.",
  },
  {
    name: "desktop",
    in: [...main("desktop"), ...DESKTOP_RENDERER],
    members: ["clipboard", "desktopCapturer", "getDisplayMedia"],
    message: "The mascot on the desktop never reads the screen, the clipboard or another app.",
  },
];

const nameOf = (key, computed) => {
  if (!computed && key.type === "Identifier") return key.name;
  return key.type === "Literal" && typeof key.value === "string" ? key.value : null;
};

const onlyFrom = {
  meta: { type: "problem", schema: false },
  create(context) {
    const [{ members, declaredIn, message }] = context.options;
    // With `declaredIn`, a member counts only if the type it's read from has it from that file.
    const fromThere = (holder, name) => {
      if (!declaredIn) return true;
      if (!holder) return false;
      const type = context.sourceCode.parserServices.getTypeAtLocation(holder);
      return (type.isUnion() ? type.types : [type]).some((part) =>
        (part.getProperty(name)?.declarations ?? []).some((d) => d.getSourceFile().fileName.replaceAll("\\", "/").endsWith(declaredIn)),
      );
    };
    const check = (node, key, computed, holder) => {
      const name = nameOf(key, computed);
      if (name && members.includes(name) && fromThere(holder, name)) context.report({ node, message: `${message} See eslint.calls.mjs.` });
    };
    return {
      MemberExpression: (node) => check(node, node.property, node.computed, node.object),
      "ObjectPattern > Property": (node) => check(node, node.key, node.computed, node.parent),
      ImportSpecifier: (node) => check(node, node.imported, false, null),
    };
  },
};

// A folder named stands for every file in it. A glob must start in a folder that exists.
const asGlob = (place) => {
  const path = place.split("/**")[0];
  if (!existsSync(new URL(path, import.meta.url))) throw new Error(`eslint.calls.mjs names a place that doesn't exist: ${path}`);
  return /\.tsx?$/.test(place) || place !== path ? place : `${place}/**/*.{ts,tsx}`;
};

export const callBlocks = checks.map((check) => {
  const plugin = `calls-${check.name}`;
  if (check.declaredIn) asGlob(check.declaredIn);
  return {
    files: check.in.map(asGlob),
    ignores: (check.allowed ?? []).map(asGlob),
    plugins: { [plugin]: { rules: { "only-from": onlyFrom } } },
    rules: { [`${plugin}/only-from`]: ["error", { members: check.members, declaredIn: check.declaredIn, message: check.message }] },
  };
});
