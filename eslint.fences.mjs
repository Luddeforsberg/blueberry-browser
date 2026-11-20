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
import eslintPluginReact from "eslint-plugin-react";

const FREE = ["**/*.test.ts", "**/*.test.tsx", "**/*Testing.ts", "tests/**", "evals/**", "supabase/**"];

// Why a screen still draws its own controls. Moving one onto the kit would change how it looks, so each moves in a
// change of its own.
const BUTTONS = "Its own buttons, from before the kit.";
const FIELDS = "A field, which the kit has none of yet.";
const BOTH = "Its own buttons, from before the kit, and a field, which the kit has none of yet.";

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
  {
    name: "kit",
    in: ["src/renderer/**/*.tsx"],
    allowed: { "src/renderer/common/components": "The kit itself." },
    heldBack: {
      "src/renderer/chrome/src/DesktopApp.tsx": BUTTONS,
      "src/renderer/chrome/src/DesktopBox.tsx": BOTH,
      "src/renderer/chrome/src/DesktopSheets.tsx": BOTH,
      "src/renderer/chrome/src/MenuApp.tsx": BUTTONS,
      "src/renderer/chrome/src/SuggestionsApp.tsx": BUTTONS,
      "src/renderer/chrome/src/components/AccountForm.tsx": FIELDS,
      "src/renderer/chrome/src/components/AccountMenu.tsx": BUTTONS,
      "src/renderer/chrome/src/components/AddMenu.tsx": BUTTONS,
      "src/renderer/chrome/src/components/AddressBar.tsx": BOTH,
      "src/renderer/chrome/src/components/AiKeyForm.tsx": BOTH,
      "src/renderer/chrome/src/components/AttachmentChips.tsx": BUTTONS,
      "src/renderer/chrome/src/components/ChatMessage.tsx": BUTTONS,
      "src/renderer/chrome/src/components/ChatPanel.tsx": BUTTONS,
      "src/renderer/chrome/src/components/Composer.tsx": BOTH,
      "src/renderer/chrome/src/components/ComposerPills.tsx": BUTTONS,
      "src/renderer/chrome/src/components/DownloadRow.tsx": BUTTONS,
      "src/renderer/chrome/src/components/FindBarCard.tsx": FIELDS,
      "src/renderer/chrome/src/components/FirstJobs.tsx": BUTTONS,
      "src/renderer/chrome/src/components/FirstRun.tsx": BOTH,
      "src/renderer/chrome/src/components/FirstRunParts.tsx": BUTTONS,
      "src/renderer/chrome/src/components/HistoryImport.tsx": BUTTONS,
      "src/renderer/chrome/src/components/HorizontalToolbar.tsx": BUTTONS,
      "src/renderer/chrome/src/components/JobGroups.tsx": BUTTONS,
      "src/renderer/chrome/src/components/MascotPerch.tsx": BUTTONS,
      "src/renderer/chrome/src/components/MemoryInChat.tsx": BUTTONS,
      "src/renderer/chrome/src/components/NeedsYouNotice.tsx": BUTTONS,
      "src/renderer/chrome/src/components/PageFrame.tsx": FIELDS,
      "src/renderer/chrome/src/components/PasswordInput.tsx": BOTH,
      "src/renderer/chrome/src/components/QuestionCards.tsx": BUTTONS,
      "src/renderer/chrome/src/components/ReplySteps.tsx": BUTTONS,
      "src/renderer/chrome/src/components/RoutineNotice.tsx": BUTTONS,
      "src/renderer/chrome/src/components/RoutineRunRow.tsx": BUTTONS,
      "src/renderer/chrome/src/components/SegmentSwitch.tsx": BUTTONS,
      "src/renderer/chrome/src/components/SettingsRow.tsx": BUTTONS,
      "src/renderer/chrome/src/components/SidebarChats.tsx": BOTH,
      "src/renderer/chrome/src/components/SidebarFoot.tsx": BUTTONS,
      "src/renderer/chrome/src/components/SidebarLabels.tsx": BUTTONS,
      "src/renderer/chrome/src/components/SidebarTabs.tsx": BUTTONS,
      "src/renderer/chrome/src/components/StepCard.tsx": BOTH,
      "src/renderer/chrome/src/components/SuggestionItem.tsx": BUTTONS,
      "src/renderer/chrome/src/components/Tabs.tsx": BUTTONS,
      "src/renderer/chrome/src/components/ToolBarButton.tsx": BUTTONS,
      "src/renderer/chrome/src/components/WorkingNotice.tsx": BUTTONS,
      "src/renderer/chrome/src/components/WorkingView.tsx": BUTTONS,
      "src/renderer/chrome/src/pages/AccountSettings.tsx": FIELDS,
      "src/renderer/chrome/src/pages/CloudSettings.tsx": BOTH,
      "src/renderer/chrome/src/pages/GalleryTile.tsx": BUTTONS,
      "src/renderer/chrome/src/pages/HistoryPage.tsx": BUTTONS,
      "src/renderer/chrome/src/pages/MascotAnswers.tsx": BOTH,
      "src/renderer/chrome/src/pages/MascotGalleryPage.tsx": BUTTONS,
      "src/renderer/chrome/src/pages/MascotMemory.tsx": FIELDS,
      "src/renderer/chrome/src/pages/MascotPage.tsx": FIELDS,
      "src/renderer/chrome/src/pages/MascotsPage.tsx": BUTTONS,
      "src/renderer/chrome/src/pages/NeedsYouPage.tsx": BOTH,
      "src/renderer/chrome/src/pages/NewTabPage.tsx": FIELDS,
      "src/renderer/chrome/src/pages/PhoneSettings.tsx": FIELDS,
      "src/renderer/chrome/src/pages/PublishExample.tsx": FIELDS,
      "src/renderer/chrome/src/pages/PublishMascot.tsx": FIELDS,
      "src/renderer/chrome/src/pages/RoutineAnswers.tsx": BOTH,
      "src/renderer/chrome/src/pages/RoutinesPage.tsx": BOTH,
      "src/renderer/chrome/src/pages/SignedInTo.tsx": BOTH,
    },
    rules: { "forbid-elements": ["button", "input", "textarea"] },
    message:
      "Draw controls from the UI kit in src/renderer/common/components (DESIGN.md section 8): Button from Button.tsx, and Switch, SwitchSheet, Choice or QuietChoice from Controls.tsx. The kit has no field yet, so a new <input> or <textarea> starts one there. Screens from before the kit are held back in eslint.fences.mjs.",
  },
];

const RULES = {
  "forbid-elements": eslintPluginReact.rules["forbid-elements"],
  "no-restricted-globals": builtinRules.get("no-restricted-globals"),
  "no-restricted-properties": builtinRules.get("no-restricted-properties"),
  "no-restricted-syntax": builtinRules.get("no-restricted-syntax"),
};

// Every option takes the fence's message, in the form each rule reads it.
const options = (rule, entries, message) => {
  if (rule === "no-restricted-globals") return entries.map((name) => ({ name, message }));
  if (rule === "no-restricted-syntax") return entries.map((selector) => ({ selector, message }));
  if (rule === "forbid-elements") return [{ forbid: entries.map((element) => ({ element, message })) }];
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
