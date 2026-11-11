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
      // Hover is the ink at a few percent, on any surface. Pressed is the fill of an open button or toggle.
      hover: "rgb(var(--foreground) / var(--hover-alpha))",
      pressed: "rgb(var(--pressed) / <alpha-value>)",
      outline: "rgb(var(--outline) / <alpha-value>)",
      // Controls inside a dark `surface`, in place of an outline. Transparent in light mode.
      "control-fill": "var(--control-fill)",
      attention: "rgb(var(--attention) / <alpha-value>)",
      "berry-blue": "rgb(var(--berry-blue) / <alpha-value>)",
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
        nape: "rgb(var(--berry-nape) / <alpha-value>)",
        shade: "rgb(var(--berry-shade) / <alpha-value>)",
        wing: "rgb(var(--berry-wing) / <alpha-value>)",
        crest: "rgb(var(--berry-crest) / <alpha-value>)",
        beak: "rgb(var(--berry-beak) / <alpha-value>)",
        "beak-lower": "rgb(var(--berry-beak-lower) / <alpha-value>)",
        legs: "rgb(var(--berry-legs) / <alpha-value>)",
        eye: "rgb(var(--berry-eye) / <alpha-value>)",
        pupil: "rgb(var(--berry-pupil) / <alpha-value>)",
        note: "rgb(var(--berry-note) / <alpha-value>)",
        "note-edge": "rgb(var(--berry-note-edge) / <alpha-value>)",
        gear: "rgb(var(--berry-gear) / <alpha-value>)",
        "gear-shade": "rgb(var(--berry-gear-shade) / <alpha-value>)",
        "fruit-mid": "rgb(var(--berry-fruit-mid) / <alpha-value>)",
        "fruit-dark": "rgb(var(--berry-fruit-dark) / <alpha-value>)",
        "fruit-bloom": "rgb(var(--berry-fruit-bloom) / <alpha-value>)",
      },
      // The valley's scrim and field, set by its light.
      scene: {
        sky: "rgb(var(--scene-sky) / <alpha-value>)",
        scrim: "rgb(var(--scene-scrim) / <alpha-value>)",
        field: "rgb(var(--scene-field) / <alpha-value>)",
        // Icons and words on the scrim, white in every light.
        ink: "rgb(var(--scene-ink) / <alpha-value>)",
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
    // DESIGN.md section 4: tiles and small controls, blocks and inputs on a page, the page's one corner, cards, lists
    // that open and the tray's lower corners, and the composer.
    borderRadius: {
      none: "0",
      control: "8px",
      card: "12px",
      page: "16px",
      panel: "18px",
      list: "24px",
      composer: "28px",
      full: "9999px",
    },
    // Almost none: the raised row's hairline, the composer's lift, and the floating shadow for menus and overlays.
    boxShadow: {
      none: "none",
      raised: "var(--shadow-raised)",
      selected: "var(--shadow-selected)",
      lift: "var(--shadow-lift-edge)",
      reading: "var(--shadow-reading)",
      recording: "var(--shadow-recording)",
      float: "var(--shadow-float)",
    },
    dropShadow: {
      none: "0 0 #0000",
      lift: "var(--shadow-lift)",
    },
    // Host Grotesk and IBM Plex Mono are bundled, never downloaded, and fall back to the system's own.
    fontFamily: {
      sans: [
        '"Host Grotesk Variable"',
        "-apple-system",
        "BlinkMacSystemFont",
        '"SF Pro Text"',
        '"Segoe UI Variable Text"',
        '"Segoe UI"',
        "sans-serif",
      ],
      mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
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
      regular: "var(--weight-regular)",
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
          "linear-gradient(90deg, rgb(var(--muted-foreground) / 0.55) 20%, rgb(var(--foreground)) 50%, rgb(var(--muted-foreground) / 0.55) 80%)",
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
        "berry-twitch": "berry-twitch 700ms ease-in-out infinite alternate",
        "berry-flap": "berry-flap 150ms ease-in-out infinite alternate",
        "berry-swing": "berry-swing 2600ms ease-in-out infinite alternate",
        "berry-swing-back": "berry-swing 2600ms ease-in-out -900ms infinite alternate",
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
        "berry-twitch": {
          "0%, 60%": { transform: "rotate(0deg)" },
          "80%": { transform: "rotate(-7deg)" },
          "100%": { transform: "rotate(5deg)" },
        },
        "berry-swing": {
          "0%": { transform: "rotate(-12deg)" },
          "100%": { transform: "rotate(14deg)" },
        },
        "berry-hop": {
          "0%": { transform: "translateY(0) scale(1, 1)" },
          "20%": { transform: "translateY(0) scale(1.06, 0.92)" },
          "55%": { transform: "translateY(-14%) scale(0.97, 1.04)" },
          "85%": { transform: "translateY(0) scale(1.04, 0.96)" },
          "100%": { transform: "translateY(0) scale(1, 1)" },
        },
        "berry-flap": {
          "0%": { transform: "rotate(-22deg)" },
          "100%": { transform: "rotate(18deg)" },
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
