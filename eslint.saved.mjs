// Saving can fail, and a store must never say something was saved when it wasn't. Every file a store keeps goes
// through src/main/library/savedFile.ts, whose saveFile and removeFile give back a `Saved`: whether it happened. This
// refuses any call that gives back a `Saved` and drops it, whether it's savedFile's own or a store's method passing it
// on, so the caller has to decide what not saving means. It reads types, so a `Saved` turned into a plain boolean on
// the way gets past it. Where the files may be written at all is a fence in eslint.fences.mjs.

const SAVED_IN = "src/main/library/savedFile.ts";
const MESSAGE =
  "This gives back whether it was saved, and it's dropped here. Decide what not saving means: say so to whoever was told it was done, keep the change out of memory, or return it to the caller. See eslint.saved.mjs.";

const useSaved = {
  meta: { type: "problem", schema: false },
  create(context) {
    const services = context.sourceCode.parserServices;
    const isSaved = (node) => {
      if (node?.type !== "CallExpression") return false;
      const alias = services.getTypeAtLocation(node).aliasSymbol;
      return (
        alias?.name === "Saved" &&
        (alias.declarations ?? []).some((d) => d.getSourceFile().fileName.replaceAll("\\", "/").endsWith(SAVED_IN))
      );
    };
    const check = (node) => {
      if (isSaved(node)) context.report({ node, message: MESSAGE });
    };
    return {
      ExpressionStatement: (node) => check(node.expression),
      'UnaryExpression[operator="void"]': (node) => check(node.argument),
      // `ready && save()` as a statement drops the answer just the same.
      "ExpressionStatement > LogicalExpression": (node) => check(node.right),
      "ExpressionStatement > ConditionalExpression": (node) => [node.consequent, node.alternate].forEach(check),
    };
  },
};

export const savedBlocks = [
  {
    files: ["src/main/**/*.{ts,tsx}", "runner/src/**/*.ts"],
    // Tests drop it on purpose, to look at what was saved instead.
    ignores: ["**/*.test.ts", "**/*Testing.ts"],
    plugins: { saved: { rules: { "use-it": useSaved } } },
    rules: { "saved/use-it": "error" },
  },
];
