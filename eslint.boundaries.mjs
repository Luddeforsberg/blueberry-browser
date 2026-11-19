// The import rules AGENTS.md states, as checks. Each rule says which files it holds for (`in`, minus `except`), which
// imports it refuses there, and why. `types: true` refuses `import type` too, for a module whose type alone means
// something was handed it. A regex is matched against what the import says. Static imports, `export … from` and
// `import()` all count. Every place named here must exist, so a rename can't quietly turn a rule off.
//
// What the runner bundles is checked as a whole by scripts/runnerElectron.mjs, since a rule here only sees one file.
// Where a module may only be imported by a few files, every one of them is named here, tests too: add one only with a
// reason.

import { existsSync } from "node:fs";

const ELECTRON = "^electron(/|$)|^@electron-toolkit/";
// A file, from anywhere: its name, as the last part of the import.
const file = (...names) => `(^|/)(${names.join("|")})(\\.[jt]s)?$`;
// A folder of src/main, from outside it.
const folder = (name) => `(^|/)${name}/`;
const main = (...paths) => paths.map((p) => `src/main/${p}`);

// The Electron folders, and the adapters that are the only Electron files in a folder that's otherwise free of it.
const ELECTRON_FOLDERS = main("window", "menus", "tabs", "desktop", "index.ts");
const ELECTRON_ADAPTERS = main(
  "account/Account.ts",
  "cloud/CloudTabs.ts",
  "cloud/cloudLoginAccess.ts",
  "phone/TelegramChannel.ts",
  "mcp/McpConnector.ts",
  "settings/AiKey.ts",
  "settings/sessionHandlers.ts",
);

// Files AGENTS.md calls pure: what they decide is plain data in, plain data out.
const PURE = main(
  "remoteJobs/cloudJobs.ts",
  "desktop/desktopBerryState.ts",
  "recordings/recordingTrail.ts",
  "suggestions/suggestionDigest.ts",
);
const INPUT_OUTPUT =
  `${ELECTRON}|^(node:)?(fs|fs/promises|net|http|https|http2|tls|dgram|dns|child_process|worker_threads|cluster|sqlite)$` +
  "|^(dotenv|express|playwright-core|langchain)(/|$)|^@langchain/|^@modelcontextprotocol/";

// `onlyFrom` guards a module AGENTS.md says nothing else may reach: it's refused everywhere in the app's main process
// and the runner but in the files and folders named. A guarded folder's own files reach each other with `./`, which the
// folder's pattern doesn't see, so the folder is named among its importers to say so.
const onlyFrom = (what, imports, allowed, says) => ({
  in: ["src/main", "runner/src"],
  except: main(...allowed),
  imports,
  types: true,
  message: `${says} Only ${allowed.join(", ")} may import ${what}.`,
});

const rules = [
  {
    in: ["src/main", "src/shared", "src/preload", "src/renderer", "runner", "tests", "evals"],
    imports: "(^|/)page(/|$)",
    message: "Run page code through src/main/tools/pageCode.ts, which scripts/buildPage.mjs bundles from src/page.",
  },
  {
    in: ["src/main", "runner/src"],
    except: [...ELECTRON_FOLDERS, ...ELECTRON_ADAPTERS],
    imports: ELECTRON,
    message:
      "This folder runs without Electron, so the runner can use it: only `import type` from electron here. Electron belongs in window/, menus/, tabs/, desktop/ or a named adapter.",
  },
  {
    in: ["src/preload"],
    imports: "^(?!electron$)",
    message: "A sandboxed preload loads nothing but electron, so it may only `import type` from anything else (AGENTS.md Traps).",
  },
  {
    in: ["src/renderer"],
    imports: "^(\\.\\./)+main/",
    types: true,
    message: "Renderers never import from src/main: share code through src/shared, and talk to main through the preload.",
  },
  {
    in: ["src/shared"],
    // These tests check a shared rule against the main-process code that has to agree with it.
    except: ["src/shared/firstRun.test.ts", "src/shared/phone.test.ts"],
    imports: "^(\\.\\./)+(main|renderer)/|^@(renderer|common)/",
    types: true,
    message: "src/shared is used by main, the preload and renderers alike, so it imports from none of them.",
  },
  {
    in: PURE,
    imports: INPUT_OUTPUT,
    message: "AGENTS.md calls this file pure: no Electron, files, network, processes, databases or models.",
  },
  {
    in: main("tools/pageTarget.ts"),
    syntax:
      'Program > :not(ImportDeclaration[importKind="type"], ExportNamedDeclaration[exportKind="type"], TSInterfaceDeclaration, TSTypeAliasDeclaration)',
    message: "pageTarget.ts is types only, so Tab and CdpTab can both implement it with nothing loaded.",
  },
  {
    in: main("mcp"),
    except: main("mcp/mcpPages.ts"),
    imports: folder("tools"),
    types: true,
    message: "MCP reads a page only through Berry's own tool in mcpPages.ts, on a tab that's open already (AGENTS.md).",
  },
  onlyFrom(
    "the cookie code",
    file("cloudLogins", "cloudLoginAccess"),
    ["cloud/CloudTabs.ts", "cloud/cloudLoginAccess.ts", "cloud/cloudLogins.test.ts", "cloud/cloudLoginAccess.test.ts", "window/Window.ts"],
    "Only the chrome's cloud:*-login* channels start it: no tool, mascot, MCP app or phone reaches it.",
  ),
  onlyFrom("recordings", folder("recordings"), ["recordings", "window/Window.ts"], "No tool or mascot can reach a recording."),
  onlyFrom(
    "the account",
    file("Account"),
    [
      "account/Account.test.ts",
      "window/Window.ts",
      "mascots/Gallery.ts",
      "mascots/Gallery.test.ts",
      "remoteJobs/MacJobs.ts",
      "remoteJobs/RunnerJobs.ts",
    ],
    "No tool or mascot can reach the account. Publishing and remote jobs are handed it to sign in to Supabase.",
  ),
  onlyFrom(
    "the user's AI key",
    file("AiKey", "aiKeyTry"),
    ["settings/AiKey.ts", "settings/AiKey.test.ts", "window/Window.ts"],
    "No tool, mascot, app or phone can reach the AI key: agent.ts gets it through setSavedKeyReader.",
  ),
  onlyFrom(
    "history import",
    file("browserHistory"),
    ["library/browserHistory.test.ts", "window/Window.ts"],
    "No tool can reach another browser's history.",
  ),
  onlyFrom(
    "codeEntry.ts",
    file("codeEntry"),
    ["chats/Chats.ts"],
    "A code goes from a reply through Chats.enterCode alone: no tool can reach it.",
  ),
  onlyFrom(
    "the Telegram bot",
    file("TelegramChannel"),
    ["phone/TelegramChannel.test.ts", "window/Window.ts"],
    "The bot's token never leaves main, Phone knows nothing about Telegram, and MCP can't reach it.",
  ),
  onlyFrom(
    "the phone",
    file("Phone"),
    ["phone/TelegramChannel.ts", "window/Window.ts", "chats/Chats.ts"],
    "MCP and the tools can't reach the phone.",
  ),
  onlyFrom("the desktop mascot", folder("desktop"), ["desktop", "window/Window.ts"], "No tool can reach the desktop mascot."),
  onlyFrom(
    "memory",
    folder("memory"),
    ["memory", "chats/Chats.ts", "window/Window.ts"],
    "No tool or mascot can reach what a mascot remembers.",
  ),
  onlyFrom(
    "menus",
    folder("menus"),
    ["menus", "index.ts", "window/Window.ts", "window/EventManager.ts", "desktop/DesktopBerry.ts"],
    "No page, tool, mascot, MCP app or phone can open, read or answer a menu or an Asking first card.",
  ),
  onlyFrom(
    "address suggestions",
    file("AddressSuggestions"),
    ["window/Window.ts"],
    "No tool, mascot, MCP app or phone can reach what's typed in the address field.",
  ),
  onlyFrom(
    "tab previews",
    file("TabPreviews"),
    ["window/Window.ts"],
    "A tab's preview picture goes to its view alone: never the session, a tool, a chat, MCP, the phone or the disk.",
  ),
  onlyFrom(
    "attachments",
    file("Attachments", "attachmentPrompt"),
    [
      "chats/Chats.ts",
      "chats/ChatStore.ts",
      "chats/Attachments.test.ts",
      "chats/Chats.attachments.test.ts",
      "window/Window.ts",
      "window/pictures.ts",
    ],
    "Attachments have no tool, and don't reach the phone, Telegram, MCP or the relay.",
  ),
  onlyFrom(
    "site permissions",
    file("SitePermissions", "PermissionPromptView"),
    ["settings/PermissionPromptView.ts", "settings/sessionHandlers.ts", "settings/SitePermissions.test.ts", "index.ts", "window/Window.ts"],
    "Only the permission prompt answers a site's request: Berry's tools only reach tabs.",
  ),
  onlyFrom(
    "the cloud's settings and live view",
    file("CloudTabs"),
    ["cloud/CloudTabs.test.ts", "index.ts", "window/Window.ts"],
    "The cloud's key and live view go to the chrome only, never to a tool or a chat.",
  ),
];

// ESLint keeps one setting of a rule per file, the last block's, so rules can't simply be stacked. Every folder or file
// a rule names becomes a block of its own carrying every rule that holds there, and a deeper one comes later, so a file
// gets the rules of the deepest place named that holds it.
const within = (place, path) => place === path || place.startsWith(`${path}/`);
const holds = (rule, place) => rule.in.some((p) => within(place, p)) && !(rule.except ?? []).some((p) => within(place, p));
// esquery reads a regex up to the first slash, so a slash in one is written as an escape.
const selectorRegex = (regex) => `/${regex.replaceAll("/", "\\x2F")}/`;

const places = [...new Set(rules.flatMap((rule) => [...rule.in, ...(rule.except ?? [])]))].sort((a, b) => a.length - b.length);
const missing = places.filter((place) => !existsSync(new URL(place, import.meta.url)));
if (missing.length) throw new Error(`eslint.boundaries.mjs names places that don't exist: ${missing.join(", ")}`);

export const boundaries = places.map((place) => {
  const here = rules.filter((rule) => holds(rule, place));
  const patterns = here
    .filter((rule) => rule.imports)
    .map((rule) => ({
      regex: rule.imports,
      caseSensitive: true,
      allowTypeImports: !rule.types,
      message: `${rule.message} See eslint.boundaries.mjs.`,
    }));
  const syntax = here.flatMap((rule) => [
    ...(rule.imports
      ? [
          {
            selector: `ImportExpression[source.value=${selectorRegex(rule.imports)}]`,
            message: `${rule.message} See eslint.boundaries.mjs.`,
          },
        ]
      : []),
    ...(rule.syntax ? [{ selector: rule.syntax, message: `${rule.message} See eslint.boundaries.mjs.` }] : []),
  ]);
  return {
    files: /\.tsx?$/.test(place) ? [place] : [`${place}/**/*.{ts,tsx}`],
    rules: {
      "@typescript-eslint/no-restricted-imports": patterns.length ? ["error", { patterns }] : "off",
      "no-restricted-syntax": syntax.length ? ["error", ...syntax] : "off",
    },
  };
});
