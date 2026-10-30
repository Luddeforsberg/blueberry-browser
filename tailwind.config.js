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
      surface: "rgb(var(--surface) / <alpha-value>)",
      foreground: "rgb(var(--foreground) / <alpha-value>)",
      "glass-tint": "var(--glass-tint)",
      success: "rgb(var(--success) / <alpha-value>)",
      warning: "rgb(var(--warning) / <alpha-value>)",
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
      control: "6px",
      card: "8px",
      panel: "12px",
      full: "9999px",
    },
    // Only things that float over a page get a shadow.
    boxShadow: {
      none: "none",
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
      15: ["15px", "24px"],
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
      animation: {
        "fade-in": "fade-in 240ms cubic-bezier(.32, .72, 0, 1) forwards",
      },
      keyframes: {
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
            "--tw-prose-pre-bg": "rgb(var(--muted))",
            "--tw-prose-counters": "rgb(var(--muted-foreground))",
            "--tw-prose-bullets": "rgb(var(--muted-foreground))",
            "--tw-prose-quotes": "rgb(var(--foreground))",
            "--tw-prose-quote-borders": "rgb(var(--border))",
            "--tw-prose-hr": "rgb(var(--border))",
            "--tw-prose-th-borders": "rgb(var(--border))",
            "--tw-prose-td-borders": "rgb(var(--border))",
            fontSize: "15px",
            lineHeight: "24px",
            h1: { fontSize: "20px", lineHeight: "28px", fontWeight: "600" },
            h2: { fontSize: "20px", lineHeight: "28px", fontWeight: "600" },
            h3: { fontSize: "15px", lineHeight: "24px", fontWeight: "600" },
            h4: { fontSize: "15px", lineHeight: "24px", fontWeight: "600" },
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
