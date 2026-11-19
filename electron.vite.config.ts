import { execFileSync } from "node:child_process";
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

// The page code main injects is bundled from src/page into src/main/pageCode.ts by `pnpm run page:build`. A build stops if
// that file isn't what src/page builds to, so an app never runs page code nobody reviewed.
const pageCodeCurrent: Plugin = {
  name: "page-code-current",
  apply: "build",
  buildStart() {
    execFileSync(process.execPath, [resolve(__dirname, "scripts/buildPage.mjs"), "--check"], { stdio: "inherit" });
  },
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), pageCodeCurrent],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          chrome: resolve(__dirname, "src/preload/chrome.ts"),
        },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: {
          chrome: resolve(__dirname, "src/renderer/chrome/index.html"),
        },
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@common": resolve("src/renderer/common"),
        "@shared": resolve("src/shared"),
      },
    },
    plugins: [react()],
    server: {
      fs: {
        allow: [".."],
      },
    },
  },
});
