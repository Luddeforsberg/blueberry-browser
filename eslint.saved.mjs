// Saving can fail, and a store must never say something was saved when it wasn't. Every file a store keeps goes
// through src/main/library/savedFile.ts, whose saveFile and removeFile give back a `Saved`: whether it happened. This
// refuses any call that gives back a `Saved` and drops it, whether it's savedFile's own or a store's method passing it
// on, so the caller has to decide what not saving means. It also refuses one handed to a callback whose result is
// thrown away, such as `forEach`, and one passed on as anything but a `Saved`, such as a plain boolean, since nothing
// would check its callers then. `bestEffort` in savedFile.ts is the one way to drop it on purpose. Where the files may
// be written at all is a fence in eslint.fences.mjs.

import ts from "typescript";

const SAVED_IN = "src/main/library/savedFile.ts";
const MESSAGE =
  "This gives back whether it was saved, and it's dropped here. Decide what not saving means: say so to whoever was told it was done, keep the change out of memory, return it to the caller, or, if nobody was told, use bestEffort with what it means. See eslint.saved.mjs.";
const WIDENED =
  "This passes on whether it was saved as something other than a `Saved`, so nothing checks that its callers use it. Return it as `Saved`, or, if nobody was told, use bestEffort with what not saving means. See eslint.saved.mjs.";

const useSaved = {
  meta: { type: "problem", schema: false },
  create(context) {
    const services = context.sourceCode.parserServices;
    const checker = services.program.getTypeChecker();
    const isSavedType = (type) => {
      const alias = type?.aliasSymbol;
      return (
        alias?.name === "Saved" &&
        (alias.declarations ?? []).some((d) => d.getSourceFile().fileName.replaceAll("\\", "/").endsWith(SAVED_IN))
      );
    };
    const isSaved = (node) => node != null && isSavedType(services.getTypeAtLocation(node));
    const check = (node) => {
      if (isSaved(node)) context.report({ node, message: MESSAGE });
    };
    const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
    // What an async function resolves to, since that's what its callers get.
    const returnType = (fn) => {
      const signature = checker.getSignatureFromDeclaration(services.esTreeNodeToTSNodeMap.get(fn));
      const type = signature && checker.getReturnTypeOfSignature(signature);
      return type && fn.async ? checker.getAwaitedType(type) : type;
    };
    // A callback where a function giving back nothing is expected, so whatever it gives back is thrown away.
    const thrownAway = (fn) => {
      if (fn.type === "FunctionDeclaration") return false;
      const expected = checker.getContextualType(services.esTreeNodeToTSNodeMap.get(fn));
      return (expected?.getCallSignatures() ?? []).some(
        (signature) => (checker.getReturnTypeOfSignature(signature).flags & ts.TypeFlags.Void) !== 0,
      );
    };
    const passedOn = (node, fn) => {
      if (!fn || !isSaved(node)) return;
      if (!isSavedType(returnType(fn))) context.report({ node, message: WIDENED });
      else if (thrownAway(fn)) context.report({ node, message: MESSAGE });
    };
    const enclosing = (node) => {
      let at = node.parent;
      while (at && !FUNCTIONS.has(at.type)) at = at.parent;
      return at;
    };
    return {
      ReturnStatement: (node) => passedOn(node.argument, enclosing(node)),
      "ArrowFunctionExpression[expression=true]": (node) => passedOn(node.body, node),
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
