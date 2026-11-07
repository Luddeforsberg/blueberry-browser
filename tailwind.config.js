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
    // Replaced rather than extended, so anything outside DESIGN.md doesn't generate a class.
    colors: {
      inherit: "inherit",
      current: "currentColor",
      transparent: "transparent",
      border: "rgb(var(--border) / <alpha-value>)",
      input: "rgb(var(--input) / <alpha-value>)",
      ring: "rgb(var(--ring) / <alpha-value>)",
      background: "rgb(var(--background) / <alpha-value>)",
      canvas: "rgb(var(--canvas) / <alpha-value>)",
      tray: "rgb(var(--tray) / <alpha-value>)",
      selected: "rgb(var(--selected) / <alpha-value>)",
      surface: "rgb(var(--surface) / <alpha-value>)",
      foreground: "rgb(var(--foreground) / <alpha-value>)",
      "glass-tint": "var(--glass-tint)",
      success: "rgb(var(--success) / <alpha-value>)",
      warning: "rgb(var(--warning) / <alpha-value>)",
      bookmark: "rgb(var(--bookmark) / <alpha-value>)",
      primary: {
        DEFAULT: "rgb(var(--primary) / <alpha-value>)",
        foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
      },
      secondary: {
        DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
        foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
      },
      destructive: {
        DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
        foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
      },
      muted: {
        DEFAULT: "rgb(var(--muted) / <alpha-value>)",
        foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
      },
      accent: {
        DEFAULT: "rgb(var(--accent) / <alpha-value>)",
        foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        ink: "rgb(var(--accent-ink) / <alpha-value>)",
      },
      popover: {
        DEFAULT: "rgb(var(--popover) / <alpha-value>)",
        foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
      },
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
      card: {
        DEFAULT: "rgb(var(--card) / <alpha-value>)",
        foreground: "rgb(var(--card-foreground) / <alpha-value>)",
      },
    },
    borderColor: ({ theme }) => ({
      ...theme("colors"),
      DEFAULT: theme("colors.border"),
    }),
    borderRadius: {
      none: "0",
      control: "8px",
      card: "12px",
      panel: "22px",
      composer: "26px",
      full: "9999px",
    },
    // DESIGN.md section 4: floating content, composer, selected rows, and the page's left edge.
    boxShadow: {
      none: "none",
      raised: "var(--shadow-raised)",
      selected: "var(--shadow-selected)",
      page: "var(--shadow-page)",
      card: "var(--shadow-card)",
      reading: "var(--shadow-reading)",
      // A running card opened over a Nest's board: the reading ring, floating.
      "reading-raised": "var(--shadow-reading), var(--shadow-raised)",
      recording: "var(--shadow-recording)",
      float: "0 8px 24px rgb(0 0 0 / 0.16)",
    },
    fontFamily: {
      sans: [
        "-apple-system",
        "BlinkMacSystemFont",
        '"Segoe UI Variable Text"',
        '"Segoe UI"',
        "sans-serif",
      ],
      mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
    },
    fontSize: {
      11: ["11px", "16px"],
      12: ["12px", "16px"],
      13: ["13px", "18px"],
      14: ["14px", "20px"],
      15: ["15px", "24px"],
      16: ["16px", "25px"],
      20: ["20px", "28px"],
      34: ["34px", { lineHeight: "40px", letterSpacing: "-0.02em" }],
    },
    fontWeight: {
      regular: "400",
      semibold: "600",
    },
    transitionDuration: {
      DEFAULT: "100ms",
      fast: "100ms",
      layout: "240ms",
      slowest: "320ms",
    },
    transitionTimingFunction: {
      DEFAULT: "cubic-bezier(.32, .72, 0, 1)",
      crisp: "cubic-bezier(.32, .72, 0, 1)",
    },
    extend: {
      spacing: {
        4.5: "1.125rem",
      },
      backgroundImage: {
        shimmer:
          "linear-gradient(90deg, rgb(var(--muted-foreground) / 0.55) 20%, rgb(var(--accent-ink)) 38%, rgb(var(--foreground)) 50%, rgb(var(--accent-ink)) 62%, rgb(var(--muted-foreground) / 0.55) 80%)",
        // The same sweep in grey, for a Nest waiting on the model: muted text, a little lighter as it passes.
        "shimmer-quiet":
          "linear-gradient(90deg, rgb(var(--muted-foreground)) 36%, var(--shimmer-sweep) 50%, rgb(var(--muted-foreground)) 64%)",
        // And along the outline of a card that's about to appear.
        "ghost-sweep": "linear-gradient(90deg, var(--ghost-line) 36%, var(--ghost-sweep) 50%, var(--ghost-line) 64%)",
      },
      animation: {
        "fade-in": "fade-in 240ms cubic-bezier(.32, .72, 0, 1) forwards",
        "answered": "answered 1600ms cubic-bezier(.32, .72, 0, 1) forwards",
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
        DEFAULT: {
          css: {
            "--tw-prose-body": "rgb(var(--foreground))",
            "--tw-prose-headings": "rgb(var(--foreground))",
            "--tw-prose-bold": "rgb(var(--foreground))",
            "--tw-prose-links": "rgb(var(--accent-ink))",
            "--tw-prose-code": "rgb(var(--foreground))",
            "--tw-prose-pre-code": "rgb(var(--foreground))",
            "--tw-prose-pre-bg": "rgb(var(--tray))",
            "--tw-prose-counters": "rgb(var(--muted-foreground))",
            "--tw-prose-bullets": "rgb(var(--muted-foreground))",
            "--tw-prose-quotes": "rgb(var(--foreground))",
            "--tw-prose-quote-borders": "rgb(var(--border))",
            "--tw-prose-hr": "rgb(var(--border))",
            "--tw-prose-th-borders": "rgb(var(--border))",
            "--tw-prose-td-borders": "rgb(var(--border))",
            fontSize: "16px",
            lineHeight: "25px",
            h1: { fontSize: "20px", lineHeight: "28px", fontWeight: "600" },
            h2: { fontSize: "20px", lineHeight: "28px", fontWeight: "600" },
            h3: { fontSize: "16px", lineHeight: "25px", fontWeight: "600" },
            h4: { fontSize: "16px", lineHeight: "25px", fontWeight: "600" },
            strong: { fontWeight: "600" },
            code: { fontSize: "13px", fontWeight: "400" },
            "code::before": { content: "none" },
            "code::after": { content: "none" },
            pre: { borderRadius: "8px" },
            a: { fontWeight: "400", textDecoration: "none" },
            "a:hover": { textDecoration: "underline" },
          },
        },
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require("@tailwindcss/typography")],
};
