import { describe, expect, it, vi } from "vitest";
import { pageMenuTemplate, type PageMenuActions, type PageMenuParams } from "./pageMenu";

vi.mock("electron", () => ({}));

const params = (overrides: Partial<PageMenuParams> = {}): PageMenuParams => ({
  linkURL: "",
  srcURL: "",
  mediaType: "none",
  selectionText: "",
  isEditable: false,
  misspelledWord: "",
  dictionarySuggestions: [],
  editFlags: {
    canUndo: false,
    canRedo: false,
    canCut: false,
    canCopy: false,
    canPaste: false,
    canSelectAll: false,
    canEditRichly: false,
    canDelete: false,
  },
  ...overrides,
});

const actions = () =>
  new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key: string) => (target[key] ??= vi.fn()),
  }) as unknown as PageMenuActions;

const build = (overrides: Partial<PageMenuParams> = {}, acting = actions()) =>
  pageMenuTemplate(params(overrides), { canGoBack: false, canGoForward: true, assistantName: "Berry" }, acting);

const labels = (items: ReturnType<typeof build>) => items.map((item) => item.label ?? "-");

const click = (items: ReturnType<typeof build>, label: string) =>
  (items.find((item) => item.label === label)?.click as unknown as () => void)();

describe("pageMenuTemplate", () => {
  it("offers navigation on a plain page, from the tab's real state", () => {
    const items = build();
    expect(labels(items)).toEqual(["Back", "Forward", "Reload", "-", "Select All", "-", "Print…", "Inspect"]);
    expect(items.find((item) => item.label === "Back")?.enabled).toBe(false);
    expect(items.find((item) => item.label === "Forward")?.enabled).toBe(true);
  });

  it("offers link actions on a link, but only opens web addresses", () => {
    expect(labels(build({ linkURL: "https://example.com/" }))).toEqual([
      "Open Link in New Tab",
      "Copy Link",
      "-",
      "Inspect",
    ]);
    expect(labels(build({ linkURL: "javascript:alert(1)" }))).toEqual(["Copy Link", "-", "Inspect"]);
    expect(labels(build({ linkURL: "file:///etc/passwd" }))).toEqual(["Copy Link", "-", "Inspect"]);
  });

  it("offers image actions, and only saves images from the web", () => {
    const acting = actions();
    const items = build({ mediaType: "image", srcURL: "https://example.com/a.png" }, acting);
    expect(labels(items)).toEqual(["Save Image…", "Copy Image", "-", "Inspect"]);
    click(items, "Save Image…");
    expect(acting.saveImage).toHaveBeenCalledWith("https://example.com/a.png");

    expect(labels(build({ mediaType: "image", srcURL: "file:///etc/hosts" }))).toEqual(["Copy Image", "-", "Inspect"]);
  });

  it("offers Ask Berry for selected text only, and hands over just that text", () => {
    const acting = actions();
    const items = build({ selectionText: "  a jackdaw " }, acting);
    expect(labels(items)).toEqual(["Ask Berry About This", "-", "Copy", "-", "Print…", "Inspect"]);
    click(items, "Ask Berry About This");
    expect(acting.askBerry).toHaveBeenCalledWith("a jackdaw");

    expect(labels(build({ selectionText: "   " }))).not.toContain("Ask Berry About This");
  });

  it("offers editing in a field, enabled by what the page allows", () => {
    const items = build({ isEditable: true, editFlags: { ...params().editFlags, canPaste: true } });
    expect(labels(items)).toEqual(["Undo", "Redo", "-", "Cut", "Copy", "Paste", "Select All", "-", "Inspect"]);
    expect(items.find((item) => item.label === "Paste")?.enabled).toBe(true);
    expect(items.find((item) => item.label === "Cut")?.enabled).toBe(false);
  });

  it("offers spelling suggestions only for a misspelled word in a field", () => {
    const acting = actions();
    const items = build(
      { isEditable: true, misspelledWord: "jakdaw", dictionarySuggestions: ["jackdaw", "jackdaws"] },
      acting
    );
    expect(labels(items).slice(0, 4)).toEqual(["jackdaw", "jackdaws", "Add to Dictionary", "-"]);
    click(items, "jackdaw");
    expect(acting.replaceWord).toHaveBeenCalledWith("jackdaw");

    const none = build({ isEditable: true, misspelledWord: "zzzq" });
    expect(none[0]).toMatchObject({ label: "No Spelling Suggestions", enabled: false });

    expect(labels(build({ isEditable: false, misspelledWord: "jakdaw" }))).not.toContain("Add to Dictionary");
  });
});
