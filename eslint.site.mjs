// site/: the public site and the phone page, plain JavaScript that Netlify serves as it is, typed through JSDoc by
// tsconfig.site.json and tsconfig.site-worker.json. It gets every rule eslint.config.mjs gives the app's TypeScript,
// type-aware ones too, and the fences for fetch and Enter. What can't apply, and why:
// - React's rules: the site has no JSX.
// - The fences for timers and the kit: they point at React hooks and components the site can't import.
// - The fence for late work: site/app/app.js counts its reads so that one that started before a newer one still lands
//   unless the newer one already has, which Latest's turns can't say.
// - eslint.answers.mjs, eslint.boundaries.mjs, eslint.calls.mjs and eslint.saved.mjs: casts in TypeScript's own
//   syntax, and who may reach Electron, main and its files.
// The browser's names are checked by the tsconfigs, which have no Node types, so `process` or `require` fails there.

// A JSDoc cast, `/** @type {T} */ (value)`, says a value is a T without looking, as `as T` does in TypeScript. Check it
// instead: `instanceof`, `typeof`, fieldsOf from site/shared.js, or a parser beside the call.
const noJsdocCast = {
  meta: { type: "problem", schema: false },
  create(context) {
    const { sourceCode } = context;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type !== "Block" || !/@(type|satisfies)\b/.test(comment.value)) continue;
          const after = sourceCode.text.slice(comment.range[1]).trimStart();
          if (after.startsWith("("))
            context.report({
              loc: comment.loc,
              message:
                "A JSDoc cast says a value is a type without looking. Check it with instanceof, typeof or fieldsOf from site/shared.js instead (eslint.site.mjs).",
            });
        }
      },
    };
  },
};

export const siteBlocks = [
  {
    files: ["site/**/*.js"],
    plugins: { site: { rules: { "no-jsdoc-cast": noJsdocCast } } },
    rules: { "site/no-jsdoc-cast": "error" },
  },
];
