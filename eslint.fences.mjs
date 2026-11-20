// Fences: something risky is written in one place, and lint fails anywhere else with a message pointing there. Each
// fence says where it holds (`in`), where the thing belongs (`allowed`), and which files still write it from before the
// fence (`heldBack`), each with why. Like eslint.limits.mjs, a held-back entry only ever leaves: take it out once its
// file is moved onto the one place, and never add one. Tests, fakes and evals are outside every fence.
//
// Each fence is a rule of its own, ESLint's own restriction rule under the fence's name, such as
// fence-fetch/no-restricted-globals. ESLint keeps one setting of a rule per file, so fences sharing a rule would undo
// each other and the rules eslint.boundaries.mjs sets. Every file named here must exist, so a rename can't quietly
// take a file out of a fence.

import { existsSync, statSync } from "node:fs";
import { builtinRules } from "eslint/use-at-your-own-risk";

const FREE = ["**/*.test.ts", "**/*.test.tsx", "**/*Testing.ts", "tests/**", "evals/**", "supabase/**"];

const fences = [
  {
    name: "fetch",
    in: ["src/**/*.{ts,tsx}", "runner/src/**/*.ts"],
    allowed: {
      "src/main/account/galleryServer.ts": "Supabase, from the app.",
      "runner/src/db.ts": "Supabase, from the cloud runner.",
      "src/shared/phoneCalls.ts": "Supabase, from the phone page, which bundles it into site/shared.js.",
      "src/main/cloud/browserbase.ts": "Browserbase's API.",
      "src/main/phone/TelegramChannel.ts": "Telegram's Bot API.",
      "src/main/settings/aiKeyTry.ts": "A model provider, to try the user's key.",
      "src/main/tools/webFetch.ts": "Firecrawl, to read a page.",
      "src/main/tools/webSearch.ts": "Firecrawl, to search.",
    },
    rules: {
      "no-restricted-globals": ["fetch"],
      "no-restricted-properties": ["globalThis", "window", "self"].map((object) => ({ object, property: "fetch" })),
    },
    message:
      "Each service is called from one file: Supabase from account/galleryServer.ts (runner/src/db.ts on the runner, shared/phoneCalls.ts on the phone page), Browserbase from cloud/browserbase.ts, Telegram from phone/TelegramChannel.ts, Firecrawl from tools/webFetch.ts and tools/webSearch.ts, and a model provider's key from settings/aiKeyTry.ts. Call that file, or give a new service a file of its own, allowed in eslint.fences.mjs.",
  },
  {
    // Main's timers stay where they are: they're the scheduler's and the pollers' own logic.
    name: "timers",
    in: ["src/renderer/**/*.{ts,tsx}"],
    allowed: { "src/renderer/common/lib/timers.ts": "useNow and useForAMoment." },
    heldBack: {
      "src/renderer/chrome/src/DesktopApp.tsx":
        "Its own useNow pauses on null and takes the time again when it restarts, which the shared one doesn't.",
      "src/renderer/chrome/src/MenuApp.tsx": "The rest on a row before its submenu opens, started again on every row.",
      "src/renderer/chrome/src/OverlayApp.tsx": "Hides the floating sidebar once it has slid out, unless it slides back in first.",
      "src/renderer/chrome/src/TabPreviewApp.tsx": "The old face stays while the new one slides over it.",
      "src/renderer/chrome/src/main.tsx": "A timer per scrolled element for its scroll thumb, outside React.",
      "src/renderer/chrome/src/components/ChatMessage.tsx":
        "Copied waits from the first copy, not the last, so useForAMoment would change it.",
      "src/renderer/chrome/src/components/RunnerView.tsx":
        "Asks for the live view at once and again every few seconds, ignoring an answer that comes too late.",
      "src/renderer/chrome/src/components/TabPreview.tsx": "The rest and grace timers of the preview's state machine.",
      "src/renderer/chrome/src/components/useAddressSuggestions.ts":
        "Waits for typing to pause, and drops an answer that comes after the next key.",
      "src/renderer/chrome/src/components/useSiteDrag.ts": "Swallows the click that ends a drag, for one turn of the event loop.",
      "src/renderer/chrome/src/components/useTabDrag.ts": "Lets a dropped tab settle before it moves.",
      "src/renderer/chrome/src/pages/CloudPage.tsx": "Fits the cloud tab once a resize has settled.",
      "src/renderer/chrome/src/pages/HistoryPage.tsx": "Searches once typing pauses, or at once with nothing typed.",
      "src/renderer/chrome/src/pages/NeedsYouPage.tsx":
        "Keeps an answer's words for a moment: a value, not the yes or no useForAMoment holds.",
      "src/renderer/chrome/src/pages/useMascotSwitch.ts": "Two timers for the steps of a mascot arriving.",
      "src/renderer/common/components/PermissionCard.tsx": "Arms its buttons a moment after it shows.",
      "src/renderer/common/components/Tooltip.tsx":
        "The rest and grace timers of the tooltip's state machine, and the old words crossing over.",
      "src/renderer/common/components/motion.ts": "The motion hooks: a menu leaving, rows folding and opening, and a loop's frames.",
      "src/renderer/common/components/useMascotReaction.ts": "Ends a mascot's reaction, stopped together with its animation.",
    },
    rules: {
      "no-restricted-globals": ["setTimeout", "setInterval"],
      "no-restricted-properties": ["globalThis", "window", "self"].flatMap((object) =>
        ["setTimeout", "setInterval"].map((property) => ({ object, property })),
      ),
    },
    message:
      "In a renderer, wait and repeat with useNow or useForAMoment from @common/lib/timers, which clear their timer when the component goes. If neither fits, add a hook there rather than a timer here (eslint.fences.mjs).",
  },
];

const RULES = {
  "no-restricted-globals": builtinRules.get("no-restricted-globals"),
  "no-restricted-properties": builtinRules.get("no-restricted-properties"),
  "no-restricted-syntax": builtinRules.get("no-restricted-syntax"),
};

// Every option takes the fence's message, in the form each rule reads it.
const options = (rule, entries, message) => {
  if (rule === "no-restricted-globals") return entries.map((name) => ({ name, message }));
  if (rule === "no-restricted-syntax") return entries.map((selector) => ({ selector, message }));
  return entries.map((entry) => ({ ...entry, message }));
};

// A folder named stands for everything in it.
const asGlob = (place) => {
  if (!existsSync(new URL(place, import.meta.url))) throw new Error(`eslint.fences.mjs names a place that doesn't exist: ${place}`);
  return statSync(new URL(place, import.meta.url)).isDirectory() ? `${place}/**` : place;
};

export const fenceBlocks = fences.flatMap((fence) => {
  const plugin = `fence-${fence.name}`;
  const exempt = [...Object.keys(fence.allowed ?? {}), ...Object.keys(fence.heldBack ?? {})].map(asGlob);
  return [
    { plugins: { [plugin]: { rules: Object.fromEntries(Object.keys(fence.rules).map((rule) => [rule, RULES[rule]])) } } },
    {
      files: fence.in,
      ignores: [...FREE, ...exempt],
      rules: Object.fromEntries(
        Object.entries(fence.rules).map(([rule, entries]) => [`${plugin}/${rule}`, ["error", ...options(rule, entries, fence.message)]]),
      ),
    },
  ];
});
