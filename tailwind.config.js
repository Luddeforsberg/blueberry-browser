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
      berry: {
        ink: "rgb(var(--berry-ink) / <alpha-value>)",
        wing: "rgb(var(--berry-wing) / <alpha-value>)",
        nape: "rgb(var(--berry-nape) / <alpha-value>)",
        eye: "rgb(var(--berry-eye) / <alpha-value>)",
        pupil: "rgb(var(--berry-pupil) / <alpha-value>)",
        beak: "rgb(var(--berry-beak) / <alpha-value>)",
        gear: "rgb(var(--berry-gear) / <alpha-value>)",
        "gear-shade": "rgb(var(--berry-gear-shade) / <alpha-value>)",
        "fruit-mid": "rgb(var(--berry-fruit-mid) / <alpha-value>)",
        "fruit-dark": "rgb(var(--berry-fruit-dark) / <alpha-value>)",
        "fruit-bloom": "rgb(var(--berry-fruit-bloom) / <alpha-value>)",
        "fruit-crown": "rgb(var(--berry-fruit-crown) / <alpha-value>)",
      },
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
    // Rows and small chips, tiles and groups, sheets and cards in the chat, menus, the prompt card and its shell.
    borderRadius: {
      none: "0",
      row: "9px",
      tile: "12px",
      sheet: "16px",
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
      backgroundImage: {
        shimmer:
          "linear-gradient(90deg, rgb(var(--ink-3)) 20%, rgb(var(--ink)) 50%, rgb(var(--ink-3)) 80%)",
      },
      animation: {
        "fade-in": "fade-in 280ms cubic-bezier(.2, .8, .2, 1) forwards",
        "answered": "answered 1600ms cubic-bezier(.2, .8, .2, 1) forwards",
        shimmer: "shimmer 1300ms linear infinite",
        // Berry's own motion. Bounce belongs to Berry, never the chrome.
        "berry-bob": "berry-bob 900ms ease-in-out infinite",
        "berry-feather": "berry-feather 1200ms ease-in forwards",
        "berry-pose": "berry-pose 160ms ease-out",
        "berry-settle": "berry-settle 420ms ease-out",
        "berry-blink": "berry-blink 6s linear infinite",
        "berry-toss": "berry-toss 1400ms ease-in-out infinite",
        "berry-flap": "berry-flap 150ms ease-in-out infinite alternate",
        "berry-swing": "berry-swing 2600ms ease-in-out infinite alternate",
        "berry-swing-back": "berry-swing 2600ms ease-in-out -900ms infinite alternate",
        "berry-peck": "berry-peck 700ms ease-in-out infinite",
        "berry-print": "berry-print 30s ease-in forwards",
        "berry-hop": "berry-hop 420ms ease-out",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "150% 0" },
          "100%": { backgroundPosition: "-50% 0" },
        },
        "berry-bob": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        "berry-pose": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "berry-settle": {
          "0%": { transform: "translate(-6px, -20px)" },
          "65%": { transform: "translate(0, 0)" },
          "82%": { transform: "translate(0, -3px)" },
          "100%": { transform: "translate(0, 0)" },
        },
        "berry-blink": {
          "0%, 95%, 100%": { transform: "scaleY(1)" },
          "97.5%": { transform: "scaleY(0.08)" },
        },
        "berry-toss": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(14px)" },
        },
        "berry-swing": {
          "0%": { transform: "rotate(-12deg)" },
          "100%": { transform: "rotate(14deg)" },
        },
        "berry-peck": {
          "0%, 55%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(38deg)" },
        },
        "berry-hop": {
          "0%": { transform: "translateY(0) scale(1, 1)" },
          "20%": { transform: "translateY(0) scale(1.06, 0.92)" },
          "55%": { transform: "translateY(-14%) scale(0.97, 1.04)" },
          "85%": { transform: "translateY(0) scale(1.04, 0.96)" },
          "100%": { transform: "translateY(0) scale(1, 1)" },
        },
        "berry-print": {
          "0%": { opacity: "0.3" },
          "100%": { opacity: "0" },
        },
        "berry-flap": {
          "0%": { transform: "rotate(-16deg)" },
          "100%": { transform: "rotate(24deg)" },
        },
        "berry-feather": {
          "0%": { transform: "translate(0, 0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translate(-4px, 14px) rotate(-40deg)", opacity: "0" },
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
