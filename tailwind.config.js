/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/renderer/**/*.{js,ts,jsx,tsx,html}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    // DESIGN.md section 4. Replaced rather than extended, so anything outside it doesn't generate a class.
    colors: {
      inherit: "inherit",
      current: "currentColor",
      transparent: "transparent",
      ground: "rgb(var(--ground) / <alpha-value>)",
      tray: "rgb(var(--tray) / <alpha-value>)",
      well: "rgb(var(--well) / <alpha-value>)",
      sheet: "rgb(var(--sheet) / <alpha-value>)",
      "sheet-2": "rgb(var(--sheet-2) / <alpha-value>)",
      ink: "rgb(var(--ink) / <alpha-value>)",
      "ink-2": "rgb(var(--ink-2) / <alpha-value>)",
      "ink-3": "rgb(var(--ink-3) / <alpha-value>)",
      faint: "rgb(var(--faint) / <alpha-value>)",
      line: "var(--line)",
      dot: "var(--dot)",
      hover: "var(--hover)",
      press: "var(--press)",
      ask: "rgb(var(--ask) / <alpha-value>)",
      "ask-bg": "rgb(var(--ask-bg) / <alpha-value>)",
      focus: "rgb(var(--focus) / <alpha-value>)",
    },
    borderColor: ({ theme }) => ({
      ...theme("colors"),
      DEFAULT: theme("colors.line"),
    }),
    // The focus ring always has a gap in the ground's colour (DESIGN.md section 8).
    ringColor: ({ theme }) => ({
      ...theme("colors"),
      DEFAULT: "rgb(var(--focus))",
    }),
    ringOffsetWidth: { DEFAULT: "2px", 0: "0px", 2: "2px" },
    // A whole colour, not a channel list: the base styles use the default as it is, with no alpha to put in.
    ringOffsetColor: ({ theme }) => ({
      ...theme("colors"),
      DEFAULT: "rgb(var(--ground))",
    }),
    // Rows and small chips, tiles and groups, sheets and cards in the chat and their shell, menus, the prompt card and
    // its shell.
    borderRadius: {
      none: "0",
      row: "9px",
      tile: "12px",
      sheet: "16px",
      "card-shell": "20px",
      menu: "22px",
      prompt: "24px",
      shell: "28px",
      full: "9999px",
    },
    boxShadow: {
      none: "none",
      rim: "var(--shadow-rim)",
      "card-lift": "var(--shadow-card-lift)",
      lift: "var(--shadow-lift)",
      recording: "var(--shadow-recording)",
    },
    fontFamily: {
      sans: ['"Geist Variable"', "system-ui", "sans-serif"],
      mono: ['"Geist Mono Variable"', "ui-monospace", "monospace"],
    },
    // DESIGN.md section 5. 11.5 and 11 are Geist Mono's.
    fontSize: {
      11: ["11px", "16px"],
      11.5: ["11.5px", "16px"],
      12: ["12px", "16px"],
      13: ["13px", "18px"],
      15: ["15px", "23px"],
      18: ["18px", { lineHeight: "26px", letterSpacing: "-0.01em" }],
      30: ["30px", { lineHeight: "36px", letterSpacing: "-0.025em" }],
    },
    fontWeight: {
      regular: "400",
      medium: "500",
    },
    transitionDuration: {
      DEFAULT: "100ms",
      fast: "100ms",
      menu: "150ms",
      panel: "280ms",
      switch: "420ms",
    },
    transitionTimingFunction: {
      DEFAULT: "cubic-bezier(.2, .8, .2, 1)",
      crisp: "cubic-bezier(.2, .8, .2, 1)",
    },
    extend: {
      spacing: {
        4.5: "1.125rem",
      },
      // The live line's words: `ink-3` with a band of `ink` passing through (DESIGN.md section 7).
      backgroundImage: {
        shimmer:
          "linear-gradient(90deg, rgb(var(--ink-3)) 38%, rgb(var(--ink)) 50%, rgb(var(--ink-3)) 62%)",
      },
      animation: {
        "fade-in": "fade-in 280ms cubic-bezier(.2, .8, .2, 1) forwards",
        "answered": "answered 1600ms cubic-bezier(.2, .8, .2, 1) forwards",
        shimmer: "shimmer 2400ms linear infinite",
        // Overshoot is the mascots' alone: one pops when it arrives (DESIGN.md section 7).
        "mascot-pop": "mascot-pop 340ms cubic-bezier(.3, 1.5, .5, 1)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "130% 0" },
          "100%": { backgroundPosition: "-130% 0" },
        },
        // A menu opening, and a mascot changing with the motion held still.
        "menu-in": {
          "0%": { transform: "scale(.96) translateY(-4px)", opacity: "0" },
          "100%": { transform: "none", opacity: "1" },
        },
        "mascot-fade": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "mascot-pop": {
          "0%": { transform: "scale(.5)", opacity: ".2" },
          "55%": { transform: "scale(1.14)", opacity: "1" },
          "100%": { transform: "none" },
        },
        // Stays long enough to read, then goes in the time a panel takes.
        answered: {
          "0%, 85%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      typography: {
        // A reply in a chat: 15px at 1.55, as every message is (DESIGN.md section 5).
        DEFAULT: {
          css: {
            "--tw-prose-body": "rgb(var(--ink))",
            "--tw-prose-headings": "rgb(var(--ink))",
            "--tw-prose-bold": "rgb(var(--ink))",
            "--tw-prose-links": "rgb(var(--ink))",
            "--tw-prose-code": "rgb(var(--ink))",
            "--tw-prose-pre-code": "rgb(var(--ink))",
            "--tw-prose-pre-bg": "rgb(var(--sheet-2))",
            "--tw-prose-counters": "rgb(var(--ink-3))",
            "--tw-prose-bullets": "rgb(var(--ink-3))",
            "--tw-prose-quotes": "rgb(var(--ink))",
            "--tw-prose-quote-borders": "var(--line)",
            "--tw-prose-hr": "var(--line)",
            "--tw-prose-th-borders": "var(--line)",
            "--tw-prose-td-borders": "var(--line)",
            fontSize: "15px",
            lineHeight: "1.55",
            h1: { fontSize: "18px", lineHeight: "26px", fontWeight: "500" },
            h2: { fontSize: "18px", lineHeight: "26px", fontWeight: "500" },
            h3: { fontSize: "15px", lineHeight: "1.55", fontWeight: "500" },
            h4: { fontSize: "15px", lineHeight: "1.55", fontWeight: "500" },
            strong: { fontWeight: "500" },
            code: { fontFamily: "inherit", fontSize: "13px", fontWeight: "400" },
            "code::before": { content: "none" },
            "code::after": { content: "none" },
            pre: { borderRadius: "9px" },
            a: { fontWeight: "400", textDecoration: "underline", textDecorationColor: "var(--line)", textUnderlineOffset: "3px" },
            "a:hover": { textDecorationColor: "currentColor" },
          },
        },
      },

    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require("@tailwindcss/typography")],
};
