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

// The type a cast is to, or any type inside it, and never the expression being cast.
const CAST = ":matches(TSAsExpression, TSTypeAssertion)";
const castTo = (type) => `${CAST} > ${type}.typeAnnotation, ${CAST} > *.typeAnnotation ${type}`;

const fences = [
  {
    name: "fetch",
    // The site too, whose generated site/shared.js carries shared/phoneCalls.ts's fetchWithin and isn't linted.
    in: ["src/**/*.{ts,tsx}", "runner/src/**/*.ts", "site/**/*.js"],
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
      "no-restricted-properties": ["globalThis", "global", "window", "self"].map((object) => ({ object, property: "fetch" })),
    },
    message:
      "Each service is called from one file: Supabase from account/galleryServer.ts (runner/src/db.ts on the runner, shared/phoneCalls.ts on the site, as fetchWithin from site/shared.js), Browserbase from cloud/browserbase.ts, Telegram from phone/TelegramChannel.ts, Firecrawl from tools/webFetch.ts and tools/webSearch.ts, and a model provider's key from settings/aiKeyTry.ts. Call that file, or give a new service a file of its own, allowed in eslint.fences.mjs.",
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
    // `as unknown as` says a value is a type it may not be, past every check. Rows from SQLite are read through
    // rowOf and rowsOf instead, and test doubles stay free. src/main/tools/pageActorArt.ts is generated and not linted.
    name: "casts",
    in: ["src/**/*.{ts,tsx}", "runner/src/**/*.ts"],
    heldBack: {
      "src/main/chats/agent.ts":
        "LangGraph's updates carry an __interrupt__ key the agent's types don't show, so reading it needs a parser of its own.",
    },
    rules: {
      "no-restricted-syntax": [
        ':matches(TSAsExpression, TSTypeAssertion)[expression.type=/^(TSAsExpression|TSTypeAssertion)$/][expression.typeAnnotation.type="TSUnknownKeyword"]',
      ],
    },
    message:
      "No `as unknown as` in app code: check the value where it enters, or read SQLite rows with rowOf or rowsOf from src/main/library/database.ts (eslint.fences.mjs).",
  },
  {
    // A cast to an object of unknown fields says a value from outside is an object when it may be null, a list or
    // anything else. fieldsOf gives each field as `unknown`, from an object or from nothing, so it's checked before use.
    name: "fields",
    in: ["src/**/*.{ts,tsx}", "runner/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        // `as Record<string, unknown>`, alone, in a list or a union, or inside another type.
        castTo(
          'TSTypeReference[typeName.name="Record"][typeArguments.params.0.type="TSStringKeyword"][typeArguments.params.1.type="TSUnknownKeyword"]',
        ),
        // `as { [key: string]: unknown }`.
        castTo(
          'TSIndexSignature[parameters.0.typeAnnotation.typeAnnotation.type="TSStringKeyword"][typeAnnotation.typeAnnotation.type="TSUnknownKeyword"]',
        ),
        // `as { name?: unknown }`, the same thing for one field.
        castTo("TSPropertySignature[optional=true] > TSTypeAnnotation > TSUnknownKeyword"),
      ],
    },
    message:
      "Use fieldsOf from src/shared/fields.ts, not a cast: each field comes out `unknown`, from an object or from nothing, to check before it's used. A list goes through entriesOf (eslint.fences.mjs).",
  },
  {
    // A store that writes its own file catches the failure itself, and has always ended up logging it and carrying on
    // as if it worked. savedFile.ts writes beside the file and renames it over, and says whether it happened.
    name: "writes",
    in: ["src/main/**/*.ts", "runner/src/**/*.ts"],
    allowed: {
      "src/main/library/savedFile.ts": "saveFile, removeFile and moveAside themselves.",
      "src/main/library/browserHistory.ts": "Copies another browser's history to a folder of its own and always deletes it.",
      "src/main/cloud/localChrome.ts": "Deletes the throwaway profile of the Chrome it started for tests.",
    },
    heldBack: {
      "src/main/cloud/cloudFile.ts": "The cloud's files are being changed in a task of their own, and move onto savedFile.ts after it.",
      "src/main/cloud/cloudLogins.ts": "The cloud's files are being changed in a task of their own, and move onto savedFile.ts after it.",
      "src/main/remoteJobs/runnerJobsFile.ts":
        "The cloud's files are being changed in a task of their own, and move onto savedFile.ts after it.",
      "runner/src/relayAuth.ts": "The cloud's files are being changed in a task of their own, and move onto savedFile.ts after it.",
    },
    rules: {
      "no-restricted-syntax": [
        // `fs` and `fs/promises`, the slash matched by a dot, since esquery reads a regex up to the first slash.
        "ImportDeclaration[source.value=/^(node:)?fs(.promises)?$/] > ImportSpecifier[imported.name=/^(writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync|rm|rmSync|unlink|unlinkSync|copyFile|copyFileSync|promises)$/]",
        "ImportDeclaration[source.value=/^(node:)?fs(.promises)?$/] > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier)",
      ],
    },
    message:
      "Save, move and remove a store's files with saveFile, removeFile and moveAside from src/main/library/savedFile.ts, which never leave half a file and say whether it happened (eslint.fences.mjs).",
  },
  {
    // Work that finishes later checks a Turn from src/shared/lateWork.ts before it applies anything. A counter of its own,
    // bumped and then compared after a wait, is how each place used to do it, and each guarded only itself.
    name: "late",
    in: ["src/**/*.{ts,tsx}", "runner/src/**/*.ts"],
    allowed: { "src/shared/lateWork.ts": "Latest itself." },
    rules: {
      "no-restricted-syntax": [
        // `const mine = ++this.count`, to compare with `this.count` once the answer is here.
        "VariableDeclarator > UpdateExpression.init",
        // A count of requests by the name every one of them had.
        "Identifier[name=/generation/i]",
        // An answer put straight into a component's state from an effect, which lands even after a newer one.
        "CallExpression[callee.name=/^use(Layout)?Effect$/] CallExpression[callee.property.name='then'][arguments.0.name=/^set[A-Z]/]",
      ],
    },
    message:
      "Use Latest from src/shared/lateWork.ts for work that finishes later: take a turn with next(), check its current before applying the answer, and end() when the owner goes. In a renderer, useLatest from @common/lib/latest, or useFromMain for something main keeps and pushes. For one at a time, use OneAtATime (eslint.fences.mjs).",
  },
  {
    // An input method uses Enter to choose its words, as for Japanese or Chinese, and a field's own check of the key
    // read that as the user pressing it, which sent a message they were still writing.
    name: "enter",
    in: ["src/renderer/**/*.{ts,tsx}", "site/**/*.js"],
    allowed: { "src/renderer/common/lib/keys.ts": "isEnter and sendOnEnter.", "site/app/dom.js": "sendsOnEnter, on the phone page." },
    rules: {
      "no-restricted-syntax": [
        'BinaryExpression[left.property.name="key"][right.value="Enter"]',
        'BinaryExpression[right.property.name="key"][left.value="Enter"]',
      ],
    },
    message:
      "Read Enter with isEnter from @common/lib/keys, which leaves an input method's Enter to the text, or sendOnEnter in a prompt box, and on the phone page sendsOnEnter from site/app/dom.js (eslint.fences.mjs).",
  },
  {
    // A site decides limits and approvals, so every copy of "the host without www." has to be the same one. Each copy
    // written out by hand answered a bad address differently, and one gave the words "a page" back as a site.
    name: "sites",
    in: ["src/**/*.{ts,tsx}", "runner/src/**/*.ts"],
    allowed: { "src/shared/sites.ts": "stripWww and siteOf themselves." },
    rules: {
      "no-restricted-syntax": [
        // /^www\./, /^(?:www\.)?/ and the like.
        "Literal[regex.pattern=/^\\^\\(?(\\?:)?www/]",
        // .replace("www.", ""), .startsWith("www.").
        'CallExpression[callee.property.name=/^(replace|replaceAll|startsWith)$/][arguments.0.value="www."]',
      ],
    },
    message:
      "Get a site from src/shared/sites.ts: siteOf for an address's site (null where it has none), siteName for the words a person reads, stripWww for a host you already have, and siteDomains.ts for the whole site it belongs to (eslint.fences.mjs).",
  },
  {
    // The words follow the platform (DESIGN.md section 14). A sentence says "this computer", which is true on a Mac and a
    // PC alike, and only the switch between here and the cloud names the computer, for whichever it is. A log line is
    // nobody's words, so it may say what it likes.
    name: "platform-words",
    in: ["src/**/*.{ts,tsx}", "runner/src/**/*.ts"],
    allowed: { "src/renderer/chrome/src/whereSides.ts": "This Mac or This PC, on the switch." },
    rules: {
      "no-restricted-syntax": [
        "Literal[value=/(^|[^A-Za-z])Mac([^A-Za-z]|$)/]:not(CallExpression[callee.object.name='console'] Literal)",
        "TemplateElement[value.raw=/(^|[^A-Za-z])Mac([^A-Za-z]|$)/]:not(CallExpression[callee.object.name='console'] TemplateElement)",
        "JSXText[value=/(^|[^A-Za-z])Mac([^A-Za-z]|$)/]",
      ],
    },
    message:
      'Say "this computer" or "your computer", which is true on any platform. Only the switch between here and the cloud names it, through whereSides in src/renderer/chrome/src/whereSides.ts (DESIGN.md section 14).',
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
