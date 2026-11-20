import { describe, expect, it } from "vitest";
import { galleryBack, galleryParam, galleryPlace, type GalleryPlace } from "./galleryPlaces";

const ID = "6f1c2a52-6d0e-4a55-9a59-1f1d3c0b2e11";

describe("where the Gallery is", () => {
  it("opens on the whole Gallery with no param, an empty one, or one nobody knows", () => {
    expect(galleryPlace(null)).toEqual({ page: "all" });
    expect(galleryPlace("")).toEqual({ page: "all" });
    expect(galleryPlace("all")).toEqual({ page: "all" });
    expect(galleryPlace(`${ID}/more`)).toEqual({ page: "all" });
    expect(galleryPlace("link/")).toEqual({ page: "all" });
    expect(galleryPlace(`link/${ID}/add`)).toEqual({ page: "all" });
  });

  it("comes back from its param as the same place", () => {
    const places: GalleryPlace[] = [
      { page: "all" },
      { page: "mascot", id: "meeting-prep" },
      { page: "mascot", id: ID },
      { page: "linked", id: ID },
    ];
    for (const place of places) expect(galleryPlace(galleryParam(place))).toEqual(place);
  });

  it("steps back from a mascot's page to the whole Gallery, and no further", () => {
    expect(galleryBack(ID)).toBe("all");
    expect(galleryBack(`link/${ID}`)).toBe("all");
    expect(galleryBack("all")).toBeNull();
    expect(galleryBack(null)).toBeNull();
  });
});
