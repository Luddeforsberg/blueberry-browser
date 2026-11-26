const motion = require("./src/renderer/common/motion.json");
const ms = (name) => `${motion.ms[name]}ms`;

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
      card: "rgb(var(--card) / <alpha-value>)",
      "card-2": "rgb(var(--card-2) / <alpha-value>)",
      ink: "rgb(var(--ink) / <alpha-value>)",
      "ink-2": "rgb(var(--ink-2) / <alpha-value>)",
      "ink-3": "rgb(var(--ink-3) / <alpha-value>)",
      faint: "rgb(var(--faint) / <alpha-value>)",
      line: "var(--line)",
      dot: "var(--dot)",
      hover: "var(--hover)",
      press: "var(--press)",
      dim: "var(--dim)",
      ask: "rgb(var(--ask) / <alpha-value>)",
      "ask-bg": "rgb(var(--ask-bg) / <alpha-value>)",
      focus: "rgb(var(--focus) / <alpha-value>)",
      tip: "rgb(var(--tip) / <alpha-value>)",
      "tip-ink": "rgb(var(--tip-ink) / <alpha-value>)",
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
      chip: "var(--shadow-chip)",
      up: "var(--shadow-up)",
      filled: "var(--shadow-filled)",
      "card-lift": "var(--shadow-card-lift)",
      lift: "var(--shadow-lift)",
      ask: "var(--shadow-ask)",
      recording: "var(--shadow-recording)",
      tip: "var(--shadow-tip)",
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
      13: ["13px", "19px"],
      14: ["14px", "20px"],
      15: ["15px", "23px"],
      20: ["20px", { lineHeight: "28px", letterSpacing: "-0.015em" }],
      30: ["30px", { lineHeight: "36px", letterSpacing: "-0.025em" }],
    },
    // Semibold is a page's title alone.
    fontWeight: {
      regular: "400",
      medium: "500",
      semibold: "600",
    },
    // DESIGN.md section 7, from motion.json, which the renderers' timers read too.
    transitionDuration: {
      DEFAULT: ms("fast"),
      fast: ms("fast"),
      tip: ms("tip"),
      menu: ms("menu"),
      move: ms("move"),
      slide: ms("slide"),
      panel: ms("panel"),
      switch: ms("switch"),
    },
    transitionTimingFunction: {
      DEFAULT: motion.ease,
      crisp: motion.ease,
    },
    extend: {
      spacing: {
        4.5: "1.125rem",
      },
      // The live line's words: `ink-3` with a band of `ink` passing through (DESIGN.md section 7).
      backgroundImage: {
        shimmer: "linear-gradient(90deg, rgb(var(--ink-3)) 38%, rgb(var(--ink)) 50%, rgb(var(--ink-3)) 62%)",
      },
      animation: {
        "fade-in": "fade-in 280ms cubic-bezier(.2, .8, .2, 1) forwards",
        answered: "answered 1600ms cubic-bezier(.2, .8, .2, 1) forwards",
        shimmer: "shimmer 2400ms linear infinite",
        // Overshoot is the mascots' alone: one pops when it arrives (DESIGN.md section 7).
        "mascot-pop": "mascot-pop 340ms cubic-bezier(.3, 1.5, .5, 1)",
        // Moving between the steps of making a mascot: the card's contents slide, and with the motion held still, fade.
        "step-next": "step-next 200ms cubic-bezier(.2, .8, .2, 1)",
        "step-back": "step-back 200ms cubic-bezier(.2, .8, .2, 1)",
        "step-fade": "mascot-fade 200ms cubic-bezier(.2, .8, .2, 1)",
        // A menu grows from its button, and goes back into it a little quicker (DESIGN.md section 7).
        // Words arriving in place of others, as a tooltip's do when it moves to a neighbour.
        fade: `mascot-fade ${ms("move")} ${motion.ease}`,
        "menu-in": `menu-in ${ms("menu")} ${motion.ease}`,
        "menu-in-above": `menu-in-above ${ms("menu")} ${motion.ease}`,
        "menu-out": `menu-out ${ms("fast")} ${motion.ease} forwards`,
        "menu-out-above": `menu-out-above ${ms("fast")} ${motion.ease} forwards`,
        // A download starting: the toolbar's arrow drops into place.
        drop: `drop ${ms("panel")} ${motion.ease}`,
        // The Gallery's page opening and going back.
        "gallery-fade": `mascot-fade ${ms("panel")} ${motion.ease}`,
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
        "menu-in-above": {
          "0%": { transform: "scale(.96) translateY(4px)", opacity: "0" },
          "100%": { transform: "none", opacity: "1" },
        },
        "menu-out": {
          "0%": { transform: "none", opacity: "1" },
          "100%": { transform: "scale(.96) translateY(-4px)", opacity: "0" },
        },
        "menu-out-above": {
          "0%": { transform: "none", opacity: "1" },
          "100%": { transform: "scale(.96) translateY(4px)", opacity: "0" },
        },
        drop: {
          "0%": { transform: "translateY(-6px)", opacity: "0" },
          "100%": { transform: "none", opacity: "1" },
        },
        "mascot-fade": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "step-next": {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "step-back": {
          "0%": { opacity: "0", transform: "translateX(-24px)" },
          "100%": { opacity: "1", transform: "none" },
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
  plugins: [require("@tailwindcss/typography")],
};
