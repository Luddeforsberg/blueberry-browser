import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import type { Account } from "./Account";
import { Gallery } from "./Gallery";
import type { GalleryServer } from "./galleryServer";
import { MascotStore } from "./MascotStore";

vi.mock("electron", () => ({}));

const ID = "00000000-0000-4000-8000-000000000001";

describe("Gallery.unpublish", () => {
  const start = (deleted: boolean) => {
    const dir = mkdtempSync(join(tmpdir(), "blueberry-gallery-"));
    const mascots = new MascotStore(join(dir, "mascots.json"));
    const saved = mascots.save(null, { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Read.", sites: [], tools: [] });
    if (!saved.ok) throw new Error(saved.error);
    mascots.setPublished(saved.id, ID);
    const server = { deleteMascot: async () => deleted } as unknown as GalleryServer;
    const account = { accessToken: async () => "token" } as unknown as Account;
    return { gallery: new Gallery(server, account, mascots, join(dir, "gallery.json"), undefined, () => {}), mascot: () => mascots.find(saved.id) };
  };

  it("forgets the link once the row is gone", async () => {
    const { gallery, mascot } = start(true);
    expect(await gallery.unpublish(ID)).toMatchObject({ ok: true });
    expect(mascot()?.publishedId).toBeUndefined();
  });

  it("says so, and keeps the link, when no row was removed", async () => {
    const { gallery, mascot } = start(false);
    expect(await gallery.unpublish(ID)).toMatchObject({ ok: false, error: expect.stringContaining("another account") });
    expect(mascot()?.publishedId).toBe(ID);
  });
});

describe("Gallery.linked", () => {
  const row = { id: ID, name: "Scout", palette: "robin", accessory: "cap", description: "Sums up SVT.", category: "News and research", instructions: "Read.", sites: ["svt.se"], tools: ["visit"], author_name: "Ana", add_count: 2, created_at: "2026-11-01T00:00:00Z" };
  const start = (mascot: (id: string) => Promise<unknown>) => {
    const dir = mkdtempSync(join(tmpdir(), "blueberry-gallery-"));
    const asked: string[] = [];
    const server = { mascot: async (id: string) => (asked.push(id), mascot(id)) } as unknown as GalleryServer;
    const gallery = new Gallery(server, {} as Account, new MascotStore(join(dir, "mascots.json")), join(dir, "gallery.json"), "https://gallery.example", () => {});
    return { gallery, asked };
  };

  it("asks the server for that one entry, and only shows it", async () => {
    const { gallery, asked } = start(async () => row);
    expect(gallery.entry(ID)).toBeNull();
    const { entry, status } = await gallery.linked(ID);
    expect(status).toBe("live");
    expect(entry).toMatchObject({ id: ID, author: "Ana", addCount: 2, link: `https://gallery.example/m/?id=${ID}` });
    expect(asked).toEqual([ID]);
    expect(gallery.entry(ID)).toEqual(entry);
  });

  it("finds nothing for a missing, broken or different row, or one it can't reach", async () => {
    expect(await start(async () => null).gallery.linked(ID)).toEqual({ entry: null, status: "live" });
    expect(await start(async () => ({ ...row, sites: ["192.168.1.1"] })).gallery.linked(ID)).toEqual({ entry: null, status: "live" });
    expect(await start(async () => ({ ...row, id: "00000000-0000-4000-8000-000000000002" })).gallery.linked(ID)).toEqual({ entry: null, status: "live" });
    expect(await start(async () => Promise.reject(new Error("down"))).gallery.linked(ID)).toEqual({ entry: null, status: "unreachable" });
  });

  it("never asks the server about anything but a uuid", async () => {
    const { gallery, asked } = start(async () => row);
    for (const id of ["", "berry", "1 or 1=1", `${ID}&hidden=eq.true`, 7, null]) expect((await gallery.linked(id)).entry).toBeNull();
    expect(asked).toEqual([]);
  });
});
