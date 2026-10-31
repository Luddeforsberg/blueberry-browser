import { EventEmitter } from "events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { Downloads, safeFilename, uniquePath, type DownloadsDeps } from "./Downloads";

class FakeItem extends EventEmitter {
  savePath = "";
  dialogOptions: unknown = null;
  received = 0;
  paused = false;
  resumable = true;
  cancelled = false;
  constructor(private readonly name = "report.pdf", private readonly url = "https://files.example.com/a?token=secret") {
    super();
  }
  getFilename = () => this.name;
  getURL = () => this.url;
  getSavePath = () => this.savePath;
  setSavePath = (path: string) => void (this.savePath = path);
  setSaveDialogOptions = (options: unknown) => void (this.dialogOptions = options);
  getReceivedBytes = () => this.received;
  getTotalBytes = () => 100;
  isPaused = () => this.paused;
  canResume = () => this.resumable;
  pause = () => void (this.paused = true);
  resume = () => void (this.paused = false);
  cancel = () => void (this.cancelled = true);
}

const setup = (settings: Partial<ReturnType<DownloadsDeps["settings"]>> = {}) => {
  const root = mkdtempSync(join(tmpdir(), "blueberry-downloads-"));
  const folder = join(root, "saved");
  const file = join(root, "downloads.json");
  const deps = {
    settings: () => ({ downloadFolder: folder, askWhereToSave: false, ...settings }),
    systemFolder: () => join(root, "system"),
    openPath: vi.fn(async () => ""),
    showItemInFolder: vi.fn(),
  };
  return { root, folder, file, deps, downloads: new Downloads(file, deps) };
};

describe("safeFilename", () => {
  it("keeps a plain name", () => {
    expect(safeFilename("report final.pdf")).toBe("report final.pdf");
  });

  it("can't leave the folder or hide as a dotfile", () => {
    expect(safeFilename("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeFilename("..\\..\\boot.ini")).toBe("_.._boot.ini");
    expect(safeFilename(".bashrc")).toBe("bashrc");
    expect(safeFilename("a\u0000b\nc.txt")).toBe("a_b_c.txt");
  });

  it("falls back when nothing usable is left", () => {
    expect(safeFilename("")).toBe("download");
    expect(safeFilename("...")).toBe("download");
    expect(safeFilename("   ")).toBe("download");
  });

  it("shortens long names at the limit and keeps the extension", () => {
    expect(safeFilename(`${"a".repeat(196)}.pdf`)).toHaveLength(200);
    expect(safeFilename(`${"a".repeat(197)}.pdf`)).toBe(`${"a".repeat(196)}.pdf`);
    const emoji = safeFilename(`${"😀".repeat(100)}.pdf`);
    expect(Buffer.byteLength(emoji)).toBeLessThanOrEqual(200);
    expect(emoji.endsWith("😀.pdf")).toBe(true);
    expect(safeFilename(`a.${"x".repeat(300)}`)).toBe("download");
  });
});

describe("uniquePath", () => {
  it("counts up past every taken name", () => {
    const taken = new Set([join("/d", "a.pdf"), join("/d", "a (1).pdf")]);
    expect(uniquePath("/d", "b.pdf", (path) => taken.has(path))).toBe(join("/d", "b.pdf"));
    expect(uniquePath("/d", "a.pdf", (path) => taken.has(path))).toBe(join("/d", "a (2).pdf"));
  });

  it("keeps compound and missing extensions whole", () => {
    expect(uniquePath("/d", "a.tar.gz", (path) => path === join("/d", "a.tar.gz"))).toBe(join("/d", "a (1).tar.gz"));
    expect(uniquePath("/d", "a", (path) => path === join("/d", "a"))).toBe(join("/d", "a (1)"));
  });
});

describe("Downloads", () => {
  it("saves without a dialog, and gives two at once different names", () => {
    const { downloads, folder } = setup();
    const [first, second] = [new FakeItem(), new FakeItem()];
    downloads.track(first);
    downloads.track(second);
    expect(first.savePath).toBe(join(folder, "report.pdf"));
    expect(second.savePath).toBe(join(folder, "report (1).pdf"));
    expect(first.dialogOptions).toBeNull();
  });

  it("doesn't overwrite a file already on disk", () => {
    const { downloads, folder } = setup();
    downloads.track(new FakeItem("a.txt"));
    const taken = join(folder, "b.txt");
    writeFileSync(taken, "mine");
    const item = new FakeItem("b.txt");
    downloads.track(item);
    expect(item.savePath).toBe(join(folder, "b (1).txt"));
  });

  it("uses the system folder when none is chosen, or the chosen one can't be made", () => {
    const { root, deps, file } = setup({ downloadFolder: null });
    const item = new FakeItem();
    new Downloads(file, deps).track(item);
    expect(item.savePath).toBe(join(root, "system", "report.pdf"));

    writeFileSync(join(root, "a-file"), "");
    const blocked = setup({ downloadFolder: join(root, "a-file", "inside") });
    const other = new FakeItem();
    blocked.downloads.track(other);
    expect(other.savePath).toBe(join(blocked.root, "system", "report.pdf"));
  });

  it("asks where to save when set to, and forgets the download if the dialog is cancelled", () => {
    const { downloads, folder } = setup({ askWhereToSave: true });
    const item = new FakeItem();
    downloads.track(item);
    expect(item.savePath).toBe("");
    expect(item.dialogOptions).toEqual({ defaultPath: join(folder, "report.pdf") });
    expect(downloads.list).toHaveLength(1);
    item.emit("done", {}, "cancelled");
    expect(downloads.list).toEqual([]);
  });

  it("names the download after where the user chose to save it", () => {
    const { downloads } = setup({ askWhereToSave: true });
    const item = new FakeItem();
    downloads.track(item);
    item.savePath = "/elsewhere/renamed.pdf";
    item.emit("updated", {}, "progressing");
    expect(downloads.list[0]).toMatchObject({ filename: "renamed.pdf", path: "/elsewhere/renamed.pdf" });
  });

  it("pauses, resumes and cancels the item, and only while it's live", async () => {
    const { downloads } = setup();
    const item = new FakeItem();
    downloads.track(item);
    const { id } = downloads.list[0];

    expect(await downloads.act(id, "pause")).toBe(true);
    expect(item.paused).toBe(true);
    expect(downloads.list[0].state).toBe("paused");
    expect(await downloads.act(id, "pause")).toBe(false);
    expect(await downloads.act(id, "resume")).toBe(true);
    expect(downloads.list[0].state).toBe("progressing");
    expect(await downloads.act(id, "remove")).toBe(false);

    expect(await downloads.act(id, "cancel")).toBe(true);
    expect(item.cancelled).toBe(true);
    item.emit("done", {}, "cancelled");
    expect(downloads.list[0].state).toBe("cancelled");
    expect(await downloads.act(id, "cancel")).toBe(false);
    expect(await downloads.act(id, "resume")).toBe(false);
    expect(await downloads.act("nobody", "open")).toBe(false);
  });

  it("can resume an interruption only until it's final", () => {
    const { downloads } = setup();
    const item = new FakeItem();
    downloads.track(item);
    item.emit("updated", {}, "interrupted");
    expect(downloads.list[0]).toMatchObject({ state: "interrupted", canResume: true });
    item.emit("done", {}, "interrupted");
    expect(downloads.list[0]).toMatchObject({ state: "interrupted", canResume: false });
  });

  it("opens and shows only a finished file that's still there, and notices when it isn't", async () => {
    const { downloads, deps } = setup();
    const item = new FakeItem();
    downloads.track(item);
    const { id, path } = downloads.list[0];
    expect(await downloads.act(id, "open")).toBe(false);

    writeFileSync(path, "done");
    item.received = 100;
    item.emit("done", {}, "completed");
    expect(await downloads.act(id, "open")).toBe(true);
    expect(deps.openPath).toHaveBeenCalledWith(path);
    expect(await downloads.act(id, "show")).toBe(true);
    expect(deps.showItemInFolder).toHaveBeenCalledWith(path);

    rmSync(path);
    expect(await downloads.act(id, "open")).toBe(false);
    expect(downloads.list[0].missing).toBe(true);
    expect(deps.openPath).toHaveBeenCalledTimes(1);

    writeFileSync(path, "back");
    expect((await downloads.refresh())[0].missing).toBe(false);
  });

  it("keeps the list across restarts, keeps no full address, and stops what was running", async () => {
    const { downloads, deps, file } = setup();
    const finished = new FakeItem("finished.txt");
    downloads.track(finished);
    finished.received = 100;
    finished.emit("done", {}, "completed");
    downloads.track(new FakeItem("running.txt"));

    expect(readFileSync(file, "utf8")).not.toContain("secret");
    const restarted = new Downloads(file, deps);
    expect(restarted.list.map((entry) => [entry.filename, entry.state, entry.canResume])).toEqual([
      ["running.txt", "interrupted", false],
      ["finished.txt", "completed", false],
    ]);
    expect(restarted.list[1]).toMatchObject({ source: "files.example.com", receivedBytes: 100 });
    expect((await restarted.refresh())[1].missing).toBe(true);
  });

  it("survives a corrupt file and drops entries it can't trust", () => {
    const { deps, file } = setup();
    writeFileSync(file, "{ not json");
    expect(new Downloads(file, deps).list).toEqual([]);

    const good = { id: "1", filename: "a", path: "/a", state: "completed" };
    writeFileSync(file, JSON.stringify([good, { ...good, path: "relative" }, { ...good, state: "odd" }, null, 3]));
    expect(new Downloads(file, deps).list.map((entry) => entry.id)).toEqual(["1"]);
  });

  it("keeps the newest 200, and never drops one that's running", () => {
    const { downloads } = setup();
    const oldest = new FakeItem("oldest.txt");
    downloads.track(oldest);
    for (let n = 0; n < 200; n++) {
      const item = new FakeItem(`f${n}.txt`);
      downloads.track(item);
      item.emit("done", {}, "completed");
    }
    expect(downloads.list).toHaveLength(200);
    expect(downloads.list.some((entry) => entry.filename === "oldest.txt")).toBe(true);
    expect(downloads.list.some((entry) => entry.filename === "f0.txt")).toBe(false);
  });
});
