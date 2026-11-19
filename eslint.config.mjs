import tseslint from "@electron-toolkit/eslint-config-ts";
import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier";
import eslintPluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import eslintPluginReactRefresh from "eslint-plugin-react-refresh";
import { boundaries } from "./eslint.boundaries.mjs";
import { complexityOver, linesOver, paramsOver } from "./eslint.limits.mjs";

export default tseslint.config(
  { ignores: ["**/node_modules", "**/dist", "**/out", "site/**", "src/main/tools/pageActorArt.ts", "src/main/tools/pageCode.ts"] },
  // A rule that's wrong for some code is changed here, where it can be seen, never turned off in a comment.
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" } },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat["jsx-runtime"],
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    // Type-aware rules read each file's types from the tsconfig that holds it, so every TypeScript file is in one.
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/no-for-in-array": "error",
      "@typescript-eslint/no-implied-eval": "error",
      "@typescript-eslint/no-array-delete": "error",
      "@typescript-eslint/no-duplicate-type-constituents": "error",
      "@typescript-eslint/no-redundant-type-constituents": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-base-to-string": "error",
      // A switch with a default has said what happens to the rest, so only one with neither fails.
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-enum-comparison": "error",
      "@typescript-eslint/no-unsafe-unary-minus": "error",
    },
  },
  {
    // Held back: each turns a value of any type into text with String, and a typed fix would change the text for some
    // value. A link's words that aren't one string, and a model's prompt that isn't text (docs/quality-plan.md, step 20).
    files: ["src/renderer/chrome/src/components/Markdown.tsx", "src/main/suggestions/suggestionProposals.ts"],
    rules: { "@typescript-eslint/no-base-to-string": "off" },
  },
  {
    // Held back from the any rules: tests, fakes and evals take what the code under test, a fake or a model sent back as
    // the type they expect, and a wrong guess fails the test anyway.
    files: ["tests/**", "evals/**", "supabase/**", "**/*.test.ts", "**/*Testing.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    // Held back: each takes what it reads as the type it was written as, with no parser to check it, and a parser would
    // drop what doesn't fit. JSON the stores wrote to their own SQLite columns, Telegram's answers, and what a tab's
    // page script returns, which runInPage<T> hands on as its caller's T (docs/quality-plan.md, step 20).
    files: [
      "src/main/chats/ChatStore.ts",
      "src/main/routines/RoutineStore.ts",
      "src/main/phone/TelegramChannel.ts",
      "src/main/tabs/TabPage.ts",
    ],
    rules: { "@typescript-eslint/no-unsafe-assignment": "off", "@typescript-eslint/no-unsafe-return": "off" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": eslintPluginReactHooks,
      "react-refresh": eslintPluginReactRefresh,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // Handlers and components infer their return types, so requiring them only adds noise.
      "@typescript-eslint/explicit-function-return-type": "off",
      // `node` is destructured out of react-markdown props so it isn't spread onto the DOM.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    // The chrome never uses the system's tooltip (DESIGN.md section 8): a control gets `Tooltip` instead.
    files: ["src/renderer/**/*.tsx"],
    rules: {
      "react/forbid-dom-props": [
        "error",
        {
          forbid: [
            {
              propName: "title",
              message:
                'Use <Tooltip words="…"> from @common/components/Tooltip, not the system tooltip (DESIGN.md section 8). An iframe takes aria-label.',
            },
          ],
        },
      ],
    },
  },
  {
    // Plain JavaScript can't write a return type, and a CommonJS file loads with `require`.
    files: ["**/*.{js,cjs,mjs}"],
    rules: { "@typescript-eslint/explicit-function-return-type": "off" },
  },
  {
    // Tailwind's config is CommonJS too, with a `.js` name, which is the one Tailwind looks for.
    files: ["**/*.cjs", "tailwind.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Small files and simple functions. Files over a limit today are held where they are in eslint.limits.mjs.
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "max-lines": ["error", 400],
      complexity: ["error", 20],
      "max-params": ["error", 4],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 4],
    },
  },
  // What runs in web pages is bundled from src/page alone, so it imports nothing from outside it: no package, and no
  // relative path that climbs out. src/page/index.ts can't climb at all, and a file one folder down only one level.
  ...[
    ["src/page/*.ts", "^(?!\\./)"],
    ["src/page/*/*.ts", "^(?!\\./|\\.\\./(?!\\.\\./))"],
  ].map(([files, outside]) => ({
    files: [files],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: outside, message: "Code that runs in a page imports only from src/page." }] },
      ],
    },
  })),
  {
    // An import at run time would load code the bundle never checked, and a strict page refuses it anyway.
    files: ["src/page/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", { selector: "ImportExpression", message: "Code that runs in a page imports nothing at run time." }],
    },
  },
  // Who may import what: the rules AGENTS.md states, and page code only through src/main/tools/pageCode.ts.
  ...boundaries,
  ...Object.entries(linesOver).map(([file, max]) => ({ files: [file], rules: { "max-lines": ["error", max] } })),
  ...Object.entries(complexityOver).map(([file, max]) => ({ files: [file], rules: { complexity: ["error", max] } })),
  ...Object.entries(paramsOver).map(([file, max]) => ({ files: [file], rules: { "max-params": ["error", max] } })),
  eslintConfigPrettier,
);
