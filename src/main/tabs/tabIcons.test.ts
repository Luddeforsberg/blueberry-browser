import { describe, expect, it } from "vitest";
import { TabIcons } from "./tabIcons";

const HOME = "https://www.youtube.com/";
const ICON = "https://www.youtube.com/favicon.ico";

describe("TabIcons", () => {
  it("gives a page its icon back on Back and Reload, when the page reports nothing", () => {
    const icons = new TabIcons();
    icons.remember(HOME, ICON);
    // Reload: the same address, and the tab's icon was never told again.
    expect(icons.after(HOME, HOME, ICON)).toBe(ICON);
    // Back from another site, which had its own icon.
    expect(icons.after("https://consent.example/", HOME, "https://consent.example/favicon.ico")).toBe(ICON);
  });

  it("keeps the icon on the same site until the page says otherwise, and drops it on another site", () => {
    const icons = new TabIcons();
    expect(icons.after(HOME, "https://www.youtube.com/feed", ICON)).toBe(ICON);
    expect(icons.after(HOME, "https://github.com/", ICON)).toBeNull();
    expect(icons.after("about:blank", "about:blank", ICON)).toBeNull();
  });

  it("forgets an icon when the page says it has none", () => {
    const icons = new TabIcons();
    icons.remember(HOME, ICON);
    icons.remember(HOME, null);
    expect(icons.after("https://github.com/", HOME, null)).toBeNull();
  });

  it("remembers the newest hundred addresses", () => {
    const icons = new TabIcons();
    for (let n = 0; n <= 100; n++) icons.remember(`https://site${n}.example/`, `icon-${n}`);
    expect(icons.after("https://other.example/", "https://site0.example/", null)).toBeNull();
    expect(icons.after("https://other.example/", "https://site1.example/", null)).toBe("icon-1");
    expect(icons.after("https://other.example/", "https://site100.example/", null)).toBe("icon-100");
  });
});
