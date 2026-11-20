// Draws resources/icon.png, the icon the app ships with, which electron-builder makes the .icns and .ico from: Berry on
// Paper, from the same drawing and the same code that make the icon Settings sets (AppIcon.tsx), so the default and the
// shipped one are the same picture. Runs in Electron, since it draws in a page: `pnpm run icon:build`, with
// ELECTRON_RUN_AS_NODE unset.
import { app, BrowserWindow } from "electron";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Not at the top level: Electron waits for an ES module's top-level await before it's ready, so that would never end.
app
  .whenReady()
  .then(async () => {
    const temp = mkdtempSync(join(tmpdir(), "blueberry-icon-"));
    try {
      await build({
        stdin: {
          contents: `
            import { createElement } from "react";
            import { flushSync } from "react-dom";
            import { createRoot } from "react-dom/client";
            import { SHIPPED_ICON_SIZE } from "@shared/appIcon";
            import { AppIcon } from "./src/renderer/chrome/src/components/AppIcon";
            import { iconPicture } from "./src/renderer/chrome/src/iconPicture";
            const holder = document.getElementById("icon");
            flushSync(() => createRoot(holder).render(createElement(AppIcon, { ground: "paper", size: SHIPPED_ICON_SIZE })));
            window.icon = iconPicture(holder.querySelector("svg"), SHIPPED_ICON_SIZE);
          `,
          resolveDir: root,
          loader: "ts",
        },
        bundle: true,
        format: "iife",
        jsx: "automatic",
        alias: { "@shared": join(root, "src/shared"), "@common": join(root, "src/renderer/common") },
        define: { "process.env.NODE_ENV": '"production"' },
        outfile: join(temp, "icon.js"),
      });
      const tokens = readFileSync(join(root, "src/renderer/common/tokens.css"), "utf8");
      writeFileSync(join(temp, "icon.html"), `<!doctype html><style>${tokens}</style><div id="icon"></div><script src="icon.js"></script>`);

      const window = new BrowserWindow({ show: false });
      await window.loadFile(join(temp, "icon.html"));
      const png = await window.webContents.executeJavaScript("window.icon");
      writeFileSync(join(root, "resources/icon.png"), Buffer.from(png.replace(/^data:image\/png;base64,/, ""), "base64"));
      console.log("Wrote resources/icon.png");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app.quit());
