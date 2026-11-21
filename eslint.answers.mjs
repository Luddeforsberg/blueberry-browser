// An answer from outside is checked where it comes in, never handed on as whatever type its caller names. A helper that
// calls a server, an API or a script and gives back `Promise<T>` with `as T` at the end says the answer is a T without
// looking, for every caller at once. So this refuses a cast to a type parameter of the function or class it's in, alone or
// inside another type. Give back `unknown` and check it, with fieldsOf and entriesOf from src/shared/fields.ts or a
// parser beside the call. Tests, fakes and evals are free. Every file named here must exist, so a rename can't quietly
// take one out of the check.

import { existsSync } from "node:fs";

const MESSAGE =
  "This says an answer is whatever type its caller names, without looking. Give back `unknown` and check it where it comes in, with fieldsOf and entriesOf from src/shared/fields.ts or a parser beside it (eslint.answers.mjs).";

// Where the cast is the one way in, or waits for a change of its own.
const ALLOWED = {
  "src/main/library/database.ts": "rowOf and rowsOf: a SQLite row has the columns its statement's own SQL names.",
};
const HELD_BACK = {
  "src/main/cloud/browserbase.ts": "Browserbase's answers, which move once #170 has rewritten the cloud folder.",
  "src/main/tools/CdpTab.ts": "What a page script gives back over CDP, which each tool reads as its own script's shape.",
  "src/main/tabs/TabPage.ts": "What a page script gives back in a tab, the same, and held back in eslint.config.mjs too.",
  "src/main/window/EventManager.ts":
    "A renderer's arguments, as the IPC contract types them. Each handler that takes something risky checks it as unknown.",
};

const noCastToTypeParameter = {
  meta: { type: "problem", schema: false },
  create(context) {
    const { visitorKeys } = context.sourceCode;
    const inScope = (node) => {
      const names = new Set();
      for (let at = node.parent; at; at = at.parent) at.typeParameters?.params.forEach((param) => names.add(param.name.name));
      return names;
    };
    const names = (type, scope) => {
      if (!type || typeof type.type !== "string") return false;
      if (type.type === "TSTypeReference" && type.typeName.type === "Identifier" && scope.has(type.typeName.name)) return true;
      return (visitorKeys[type.type] ?? []).some((key) => [type[key]].flat().some((child) => names(child, scope)));
    };
    const check = (node) => {
      const scope = inScope(node);
      if (scope.size > 0 && names(node.typeAnnotation, scope)) context.report({ node, message: MESSAGE });
    };
    return { TSAsExpression: check, TSTypeAssertion: check };
  },
};

const place = (file) => {
  if (!existsSync(new URL(file, import.meta.url))) throw new Error(`eslint.answers.mjs names a file that doesn't exist: ${file}`);
  return file;
};

export const answerBlocks = [
  {
    files: ["src/main/**/*.ts", "src/shared/**/*.ts", "runner/src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*Testing.ts", ...Object.keys({ ...ALLOWED, ...HELD_BACK }).map(place)],
    plugins: { answers: { rules: { "no-cast-to-type-parameter": noCastToTypeParameter } } },
    rules: { "answers/no-cast-to-type-parameter": "error" },
  },
];
