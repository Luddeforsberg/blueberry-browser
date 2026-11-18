import tseslint from "@electron-toolkit/eslint-config-ts";
import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier";
import eslintPluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import eslintPluginReactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["**/node_modules", "**/dist", "**/out", "site/**", "src/main/pageActorArt.ts"] },
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
  eslintConfigPrettier,
);
