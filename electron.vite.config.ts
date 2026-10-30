import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
