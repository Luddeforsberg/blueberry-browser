import type { ElectronApplication } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The README's pictures are what's really on the screen: the window maximized on one display, in front, captured with its
// native frame, its caption buttons and the material behind it, pixel for pixel. Windows only, through GDI, since that's
// where they're taken. PICTURES_SCREEN_X picks the display by its left edge, or else the first that isn't the main one.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Per-monitor aware, so a display at another scale doesn't move or stretch what's read. 9 is DWMWA_EXTENDED_FRAME_BOUNDS,
// the window as drawn, without the invisible edges Windows adds for resizing.
const GDI = `
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class BlueberryScreen {
  [StructLayout(LayoutKind.Sequential)] public struct Box { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int what, out Box box, int size);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
  delegate bool EachWindow(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EachWindow each, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr window, out int process);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, System.Text.StringBuilder name, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int what, out int value, int size);
  [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr to, int x, int y, int width, int height, IntPtr from, int fromX, int fromY, int how);
  public static string Frame(long window) {
    SetProcessDpiAwarenessContext(new IntPtr(-4));
    Box box; DwmGetWindowAttribute(new IntPtr(window), 9, out box, Marshal.SizeOf(typeof(Box)));
    return box.Left + "," + box.Top + "," + (box.Right - box.Left) + "," + (box.Bottom - box.Top);
  }
  // Other apps' windows showing over any of the area, by class only, so nothing of theirs is read. 14 is DWMWA_CLOAKED.
  public static string Others(int mine, int x, int y, int width, int height) {
    SetProcessDpiAwarenessContext(new IntPtr(-4));
    var found = new System.Collections.Generic.List<string>();
    EnumWindows((window, data) => {
      int process, cloaked; Box box;
      GetWindowThreadProcessId(window, out process);
      if (process == mine || !IsWindowVisible(window) || IsIconic(window)) return true;
      DwmGetWindowAttribute(window, 14, out cloaked, 4);
      var name = new System.Text.StringBuilder(256); GetClassName(window, name, 256);
      if (cloaked != 0 || name.ToString() == "Progman" || name.ToString() == "WorkerW") return true;
      DwmGetWindowAttribute(window, 9, out box, Marshal.SizeOf(typeof(Box)));
      if (box.Right > x && box.Left < x + width && box.Bottom > y && box.Top < y + height && box.Right > box.Left) found.Add(name.ToString());
      return true;
    }, IntPtr.Zero);
    return string.Join(",", found);
  }
  public static void Save(int x, int y, int width, int height, string file) {
    SetProcessDpiAwarenessContext(new IntPtr(-4));
    using (var picture = new Bitmap(width, height, PixelFormat.Format24bppRgb)) {
      // CAPTUREBLT too, so clear windows such as the desktop mascot's are in it. CopyFromScreen refuses that flag.
      IntPtr screen = GetDC(IntPtr.Zero);
      using (var drawing = Graphics.FromImage(picture)) {
        IntPtr into = drawing.GetHdc();
        BitBlt(into, 0, 0, width, height, screen, x, y, 0x00CC0020 | 0x40000000);
        drawing.ReleaseHdc(into);
      }
      ReleaseDC(IntPtr.Zero, screen);
      picture.Save(file, ImageFormat.Png);
    }
  }
}`;

const powershell = (command: string): string =>
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", `Add-Type -ReferencedAssemblies System.Drawing @'\n${GDI}\n'@; ${command}`],
    {
      encoding: "utf8",
    },
  ).trim();

export const captureRect = ({ x, y, width, height }: Rect): Buffer => {
  const folder = mkdtempSync(join(tmpdir(), "blueberry-picture-"));
  const file = join(folder, "screen.png");
  try {
    powershell(`[BlueberryScreen]::Save(${x}, ${y}, ${width}, ${height}, '${file}')`);
    return readFileSync(file);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
};

// The browser window, found by its chrome view, maximized on the picture's display and brought in front of everything.
export const showOnScreen = (app: ElectronApplication): Promise<{ handle: string; scale: number }> =>
  app.evaluate(
    ({ app, BaseWindow, screen }, left) => {
      const displays = screen.getAllDisplays();
      const primary = screen.getPrimaryDisplay();
      const display =
        displays.find(({ bounds }) => left !== null && bounds.x === left) ?? displays.find(({ id }) => id !== primary.id) ?? primary;
      const window = BaseWindow.getAllWindows().find((each) =>
        each.contentView.children.some(
          (child) => "webContents" in child && (child as Electron.WebContentsView).webContents.getURL().includes("view=chrome"),
        ),
      );
      if (!window) throw new Error("No browser window");
      window.unmaximize();
      window.setBounds(display.workArea);
      window.maximize();
      window.show();
      window.moveTop();
      app.focus({ steal: true });
      window.focus();
      return { handle: window.getNativeWindowHandle().readBigUInt64LE(0).toString(), scale: display.scaleFactor };
    },
    process.env.PICTURES_SCREEN_X === undefined ? null : Number(process.env.PICTURES_SCREEN_X),
  );

export const windowFrame = (handle: string): Rect => {
  const [x = 0, y = 0, width = 0, height = 0] = powershell(`[BlueberryScreen]::Frame(${handle})`).split(",").map(Number);
  return { x, y, width, height };
};

// The names of other apps' windows over the area, empty when only the desktop and Blueberry's own show there.
export const othersOver = (pid: number, { x, y, width, height }: Rect): string[] =>
  powershell(`[BlueberryScreen]::Others(${pid}, ${x}, ${y}, ${width}, ${height})`).split(",").filter(Boolean);
