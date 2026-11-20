// Where the Gallery is (DESIGN.md section 10, Gallery). Like the mascots' page, the place lives in the tab's param, so
// Back, the toolbar's Back and a restored session find the mascot that was open.

export type GalleryPlace =
  | { page: "all" }
  | { page: "mascot"; id: string }
  // Opened by a `blueberry://mascot/` link, so it's asked of the server again. Main has checked the id is a uuid.
  | { page: "linked"; id: string };

const LINKED = "link/";

// An entry's id is a starter's word or a uuid, so it never has a slash and is never "all".
export const galleryParam = (place: GalleryPlace): string => {
  if (place.page === "all") return "all";
  return place.page === "linked" ? `${LINKED}${place.id}` : place.id;
};

// None, or one nobody knows, is the whole Gallery.
export const galleryPlace = (param: string | null): GalleryPlace => {
  if (!param || param === "all") return { page: "all" };
  if (param.startsWith(LINKED)) {
    const id = param.slice(LINKED.length);
    return id && !id.includes("/") ? { page: "linked", id } : { page: "all" };
  }
  return param.includes("/") ? { page: "all" } : { page: "mascot", id: param };
};

// One step back: from a mascot's page to the whole Gallery, which has nowhere to go back to.
export const galleryBack = (param: string | null): string | null =>
  galleryPlace(param).page === "all" ? null : galleryParam({ page: "all" });
