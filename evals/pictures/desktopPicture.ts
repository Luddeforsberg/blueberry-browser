import { findView } from "../../tests/app";
import { savePicture, type Founder } from "./founderApp";
import { captureRect, othersOver, type Rect } from "./screen";

// Berry on the desktop, out from the right edge of the picture's display with its prompt box open, as Alt+Space opens it
// while the browser is down in the taskbar. tests/fakeShortcut.cjs holds the shortcut, so it's pressed through the app
// rather than taken from the keyboard. The picture is that corner of the screen as it really is, cropped to the bird and
// the box, and only taken when no other app's window is there.
const CROP = { width: 960, height: 600 };

const union = (rects: Rect[]): Rect => {
  const left = Math.min(...rects.map(({ x }) => x));
  const top = Math.min(...rects.map(({ y }) => y));
  const right = Math.max(...rects.map(({ x, width }) => x + width));
  const bottom = Math.max(...rects.map(({ y, height }) => y + height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

// Against the screen's right edge, around the bird and the box, and never past the work area, so no taskbar shows.
const cropAround = (shown: Rect, area: Rect): Rect => {
  const width = Math.min(area.width, Math.max(CROP.width, shown.width + 80));
  const height = Math.min(area.height, Math.max(CROP.height, shown.height + 80));
  const middle = shown.y + shown.height / 2;
  const y = Math.round(Math.min(Math.max(middle - height / 2, area.y), area.y + area.height - height));
  return { x: area.x + area.width - width, y, width, height };
};

const windowsHolding = (founder: Founder, views: string[]) =>
  founder.app.evaluate(({ BaseWindow }, views) => {
    const holds = (window: Electron.BaseWindow, view: string) =>
      window.contentView.children.some(
        (child) => "webContents" in child && (child as Electron.WebContentsView).webContents.getURL().includes(`view=${view}`),
      );
    return views.map(
      (view) =>
        BaseWindow.getAllWindows()
          .find((window) => holds(window, view))
          ?.getBounds() ?? null,
    );
  }, views);

export async function desktopPicture(founder: Founder, name: string, words: string): Promise<void> {
  const { id, area, pid } = await founder.app.evaluate(({ screen, BaseWindow }) => {
    const main = BaseWindow.getAllWindows().find((window) => window.isMaximized());
    if (!main) throw new Error("The browser window isn't on the screen");
    const display = screen.getDisplayMatching(main.getBounds());
    main.minimize();
    return { id: display.id, area: display.workArea, pid: process.pid };
  });
  await founder.chrome.evaluate((spot) => window.chromeAPI.settings.updateSettings({ desktopBerry: true, desktopBerrySpot: spot }), {
    displayId: id,
    edge: "right" as const,
    fraction: 0.5,
  });
  const desktop = await findView(founder.app, "view=desktop");
  await desktop.locator('[data-desktop-drop][data-mood="rest"]').waitFor();
  await founder.app.evaluate(() =>
    (globalThis as unknown as { fakeShortcuts: Map<string, () => void> }).fakeShortcuts.get("Alt+Space")?.(),
  );
  const composer = await findView(founder.app, "view=composer");
  const box = composer.getByRole("textbox").first();
  await box.waitFor();
  await box.fill(words);
  await composer.waitForTimeout(1_500);
  const shown = (await windowsHolding(founder, ["desktop", "composer"])).filter((rect): rect is Rect => rect !== null);
  const crop = cropAround(union(shown), area);
  const others = othersOver(pid, crop);
  if (others.length > 0) throw new Error(`Other apps' windows are where the picture goes: ${others.join(", ")}`);
  await savePicture(founder.chrome, name, captureRect(crop));
}
