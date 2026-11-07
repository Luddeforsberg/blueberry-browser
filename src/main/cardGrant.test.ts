import { describe, expect, it } from "vitest";
import { addressGrant, CardGrants, clickGrant, typeGrant, type GrantElement } from "./cardGrant";

const SAVE: GrantElement = { role: "button", name: "Save draft", target: null, frameUrl: null };
const PAGE = "https://mail.example.com/compose?row=1";

describe("the key Allow for this card's runs matches on", () => {
  it("is the same for the same button on the same site, whatever else is on the address", () => {
    const first = clickGrant("click", PAGE, SAVE);
    expect(first).toEqual({ key: expect.any(String), words: "clicking the button “Save draft” on mail.example.com" });
    expect(clickGrant("click", "https://mail.example.com/compose?row=2", { ...SAVE })?.key).toBe(first!.key);
  });

  it("differs for another button, another role, another site, another target or another tool", () => {
    const key = clickGrant("click", PAGE, SAVE)!.key;
    expect(clickGrant("click", PAGE, { ...SAVE, name: "Send" })!.key).not.toBe(key);
    expect(clickGrant("click", PAGE, { ...SAVE, role: "link" })!.key).not.toBe(key);
    expect(clickGrant("click", "https://other.example.com/compose", SAVE)!.key).not.toBe(key);
    expect(clickGrant("click", "http://mail.example.com/compose", SAVE)!.key).not.toBe(key);
    expect(clickGrant("click", PAGE, { ...SAVE, target: "https://mail.example.com/send" })!.key).not.toBe(key);
    expect(clickGrant("double_click", PAGE, SAVE)!.key).not.toBe(key);
    expect(typeGrant(PAGE, SAVE, false)!.key).not.toBe(key);
  });

  it("never covers a secret field, anything in a frame, an element without a name, or a page that isn't on the web", () => {
    expect(clickGrant("click", PAGE, { ...SAVE, secret: true })).toBeNull();
    expect(typeGrant(PAGE, { role: "field", name: "Password", target: null, secret: true, frameUrl: null }, false)).toBeNull();
    expect(clickGrant("click", PAGE, { ...SAVE, frameUrl: "https://mail.example.com/frame" })).toBeNull();
    expect(clickGrant("click", PAGE, { ...SAVE, frameOrigin: "https://ads.example.net" })).toBeNull();
    expect(clickGrant("click", PAGE, { ...SAVE, name: "  " })).toBeNull();
    expect(clickGrant("click", PAGE, { ...SAVE, name: "unnamed" })).toBeNull();
    expect(clickGrant("click", PAGE, { ...SAVE, name: "x".repeat(201) })).toBeNull();
    expect(clickGrant("click", "file:///Users/me/a.html", SAVE)).toBeNull();
    expect(clickGrant("click", "https://me:secret@mail.example.com/", SAVE)).toBeNull();
    expect(clickGrant("click", PAGE, null)).toBeNull();
  });

  it("lets what's typed differ, but not where it goes or whether it's submitted", () => {
    const subject: GrantElement = { role: "field", name: "Subject", target: "https://mail.example.com/save", frameUrl: null };
    const key = typeGrant(PAGE, subject, false)!;
    expect(key.words).toBe("typing into the field “Subject” on mail.example.com");
    expect(typeGrant("https://mail.example.com/other", subject, false)!.key).toBe(key.key);
    expect(typeGrant(PAGE, subject, true)!.key).not.toBe(key.key);
    expect(typeGrant(PAGE, subject, true)!.words).toBe("typing into the field “Subject” and submitting it on mail.example.com");
    expect(typeGrant(PAGE, { ...subject, target: "https://mail.example.com/send" }, false)!.key).not.toBe(key.key);
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
