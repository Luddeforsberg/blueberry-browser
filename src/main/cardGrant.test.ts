import { describe, expect, it } from "vitest";
import { addressGrant, CardGrants, clickGrant, type GrantElement } from "./cardGrant";

const SAVE: GrantElement = { role: "button", name: "Save draft", target: null, frameUrl: null };
const PAGE = "https://mail.example.com/compose?row=1";

describe("the key Allow for this card's runs matches on", () => {
  it("is the same for the same button on the same site, whatever else is on the address", () => {
    const first = clickGrant(PAGE, SAVE);
    expect(first).toEqual({ key: expect.any(String), words: "clicking the button “Save draft” on mail.example.com" });
    expect(clickGrant("https://mail.example.com/compose?row=2", { ...SAVE })?.key).toBe(first!.key);
  });

  it("differs for another button, another role, another site, another target or an address", () => {
    const key = clickGrant(PAGE, SAVE)!.key;
    expect(clickGrant(PAGE, { ...SAVE, name: "Send" })!.key).not.toBe(key);
    expect(clickGrant(PAGE, { ...SAVE, role: "link" })!.key).not.toBe(key);
    expect(clickGrant("https://other.example.com/compose", SAVE)!.key).not.toBe(key);
    expect(clickGrant("http://mail.example.com/compose", SAVE)!.key).not.toBe(key);
    expect(clickGrant(PAGE, { ...SAVE, target: "https://mail.example.com/send" })!.key).not.toBe(key);
    expect(addressGrant("open_tab", PAGE)!.key).not.toBe(key);
  });

  it("never covers a secret field, anything in a frame, an element without a name, or a page that isn't on the web", () => {
    expect(clickGrant(PAGE, { ...SAVE, secret: true })).toBeNull();
    expect(clickGrant(PAGE, { ...SAVE, frameUrl: "https://mail.example.com/frame" })).toBeNull();
    expect(clickGrant(PAGE, { ...SAVE, frameOrigin: "https://ads.example.net" })).toBeNull();
    expect(clickGrant(PAGE, { ...SAVE, name: "  " })).toBeNull();
    expect(clickGrant(PAGE, { ...SAVE, name: "unnamed" })).toBeNull();
    expect(clickGrant(PAGE, { ...SAVE, name: "x".repeat(201) })).toBeNull();
    // Clipped by the page script, so another name that starts the same way would look the same.
    expect(clickGrant(PAGE, { ...SAVE, name: `Send the contract to ${"x".repeat(55)}…` })).toBeNull();
    expect(clickGrant("file:///Users/me/a.html", SAVE)).toBeNull();
    expect(clickGrant("https://me:secret@mail.example.com/", SAVE)).toBeNull();
    expect(clickGrant(PAGE, null)).toBeNull();
  });

  it("covers only the whole address for opening a page, so nothing else can go out in it", () => {
    const key = addressGrant("open_tab", "https://example.com/?ref=blueberry")!;
    expect(key.words).toBe("opening https://example.com/?ref=blueberry");
    expect(addressGrant("open_tab", "https://example.com/?ref=blueberry")!.key).toBe(key.key);
    expect(addressGrant("open_tab", "https://example.com/?ref=other")!.key).not.toBe(key.key);
    expect(addressGrant("open_tab", "https://example.com/")!.key).not.toBe(key.key);
    expect(addressGrant("go_to", "https://example.com/?ref=blueberry")!.key).not.toBe(key.key);
    expect(addressGrant("open_tab", "javascript:alert(1)")).toBeNull();
    expect(addressGrant("open_tab", "not an address")).toBeNull();
  });
});

describe("CardGrants", () => {
  it("keeps each card's grants apart and forgets them all when the card ends", () => {
    const grants = new CardGrants();
    grants.add("card-1", "save");
    expect(grants.covers("card-1", "save")).toBe(true);
    expect(grants.covers("card-1", "send")).toBe(false);
    expect(grants.covers("card-2", "save")).toBe(false);
    grants.end("card-1");
    expect(grants.covers("card-1", "save")).toBe(false);
    expect(grants.has("card-1")).toBe(false);
  });
});
