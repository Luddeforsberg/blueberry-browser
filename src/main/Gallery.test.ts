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
