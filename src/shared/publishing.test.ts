import { describe, expect, it } from "vitest";
import { linkSite, parsePublicDraft, parsePublishChoices, parsePublishedRow, plainFromMarkdown, publicRow, publishWarnings } from "./publishing";
import { MAX_MASCOT_INSTRUCTIONS, MAX_MASCOT_NAME } from "./mascots";

const ID = "00000000-0000-4000-8000-000000000001";
const draft = { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Read.", sites: ["svt.se"], tools: ["visit"] };
const row = {
  id: ID, name: "Scout", palette: "robin", accessory: "cap", description: "Reads.", category: "Work", instructions: "Read.", sites: ["svt.se"], tools: ["visit"],
  author_name: "Ana", example_prompt: "Q", example_answer: "A", add_count: 3, created_at: "2026-11-01T10:00:00Z",
};
const choices = { author: "Ana", description: "Reads.", category: "Work", example: null };

describe("what strangers publish", () => {
  it("takes out what a person can't see but a model can read", () => {
    const hidden = "\u{E0049}\u{E0067}\u{E006E}\u{E006F}\u{E0072}\u{E0065}"; // "Ignore" in invisible tag characters.
    const parsed = parsePublicDraft({ ...draft, instructions: `Re${hidden}ad\u200B.\u202E\uFE0F\nNext\tline` });
    expect(parsed).toEqual({ draft: { ...draft, instructions: "Read.\nNext\tline" } });
  });

  it.each([
    ["a tag in the name", { name: "a</mascot_name>" }],
    ["Berry's name", { name: " berry " }],
    ["Blueberry's name", { name: "BLUEBERRY" }],
    ["a name one over the limit", { name: "x".repeat(MAX_MASCOT_NAME + 1) }],
    ["instructions one over the limit", { instructions: "x".repeat(MAX_MASCOT_INSTRUCTIONS + 1) }],
    ["nothing left after cleaning", { name: "\u200B\u200B" }],
    ["localhost", { sites: ["localhost"] }],
    ["an IP address", { sites: ["svt.se", "192.168.1.1"] }],
    ["a local name", { sites: ["printer.local"] }],
  ])("refuses %s", (_, change) => {
    expect(parsePublicDraft({ ...draft, ...change })).toHaveProperty("error");
  });

  it("takes a name at the limit, with its own letters", () => {
    expect(parsePublicDraft({ ...draft, name: "Å".repeat(MAX_MASCOT_NAME) })).toHaveProperty("draft");
    expect(parsePublicDraft({ ...draft, name: "Räv's & Co-op 2.0" })).toHaveProperty("draft");
  });

  it("reads a good row, dropping anything else on it", () => {
    const parsed = parsePublishedRow({ ...row, owner: "someone", hidden: false, skipApprovals: true, tools: ["visit", "everything"] });
    expect(parsed).toEqual({
      id: ID, author: "Ana", category: "Work", description: "Reads.", example: { prompt: "Q", answer: "A" }, addCount: 3, publishedAt: Date.parse(row.created_at),
      draft: { ...draft, tools: ["visit"] },
    });
  });

  it.each([
    ["a bad id", { id: "berry" }],
    ["Berry's name", { name: "Berry" }],
    ["an unknown look", { palette: "neon" }],
    ["a site that isn't one", { sites: ["com"] }],
    ["sites that aren't a list", { sites: "svt.se" }],
    ["a local site", { sites: ["localhost"] }],
    ["an author passing for us", { author_name: "Blueberry Team" }],
    ["an author that's an address", { author_name: "a@b.se" }],
    ["no author", { author_name: null }],
    ["no description", { description: "" }],
    ["nothing at all", null],
  ])("shows nothing for a row with %s", (_, change) => {
    expect(parsePublishedRow(change && { ...row, ...change })).toBeNull();
  });

  it("drops a bad example or count, and calls an unknown category Other, without losing the mascot", () => {
    expect(parsePublishedRow({ ...row, example_answer: null })?.example).toBeNull();
    expect(parsePublishedRow({ ...row, example_answer: "x".repeat(6001) })?.example).toBeNull();
    expect(parsePublishedRow({ ...row, example_prompt: null, example_answer: null })?.example).toBeNull();
    expect(parsePublishedRow({ ...row, category: "<b>Spam</b>" })?.category).toBe("Other");
    expect(parsePublishedRow({ ...row, add_count: -5 })?.addCount).toBe(0);
    expect(parsePublishedRow({ ...row, add_count: "9" })?.addCount).toBe(0);
  });

  it("sends only the listed fields", () => {
    const parsed = parsePublishChoices({ ...choices, email: "a@b.se", chats: ["x"] });
    if ("error" in parsed) throw new Error(parsed.error);
    const sent = publicRow({ ...draft, id: "local", deletedAt: null, galleryId: "x", publishedId: "y" } as never, parsed.choices);
    expect(Object.keys(sent).sort()).toEqual(["accessory", "author_name", "category", "description", "example_answer", "example_prompt", "instructions", "name", "palette", "sites", "tools"]);
  });

  it.each([
    ["no author", { author: " " }],
    ["an address as the author", { author: "ana@example.com" }],
    ["an author one over the limit", { author: "x".repeat(41) }],
    ["no line on what it does", { description: "" }],
    ["a line one over the limit", { description: "x".repeat(141) }],
    ["an unknown category", { category: "Spam" }],
    ["half an example", { example: { prompt: "Q", answer: " " } }],
  ])("refuses %s", (_, change) => {
    expect(parsePublishChoices({ ...choices, ...change })).toHaveProperty("error");
  });

  it.each([
    ["an email address", "Send it to ana.berg@example.com every day"],
    ["an API key", "Use sk-abcdefghijklmnop1234 for it"],
    ["a GitHub token", "Token ghp_abcdefghijklmnopqrstuvwxyz1234"],
    ["a password", "My password is hunter2"],
    ["a Swedish password", "lösenord: hunter2"],
    ["a long token", "Key 9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a"],
    ["a JWT", "eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3.abcdefghij"],
    ["a card", "Pay with 4111 1111 1111 1111"],
  ])("warns about %s and doesn't block", (_, instructions) => {
    expect(publishWarnings({ instructions }, choices).length).toBeGreaterThan(0);
  });

  it("stays quiet about ordinary words, and looks in the example too", () => {
    expect(publishWarnings({ instructions: "Check the password reset page on github.com and tell me about 2026-11-01." }, choices)).toEqual([]);
    expect(publishWarnings({ instructions: "Read." }, { ...choices, example: { prompt: "Mail a@b.se", answer: "Done" } })).toEqual(["There may be an email address in the example’s question."]);
  });
});

describe("a stranger's example as plain words", () => {
  it("names a link's site instead of its whole address", () => {
    expect(linkSite("https://www.svt.se/nyheter/utrikes/a?inlagg=64849633")).toBe("svt.se");
    expect(linkSite("mailto:someone@example.com")).toBeNull();
    expect(linkSite("not a link")).toBeNull();
  });

  it("keeps the words and drops the markdown", () => {
    const answer = [
      "## Morning briefing",
      "",
      "- **Sweden:** a vote on _Tuesday_. [Ekot](https://www.sverigesradio.se/artikel/c-ledaren?x=1)",
      "* See <https://www.svt.se/nyheter> and `code`",
      "> Quoted ~~old~~ words",
      "![A chart](https://tracker.example/pixel.png)",
      "---",
      "```",
      "plain",
      "```",
    ].join("\n");
    expect(plainFromMarkdown(answer)).toBe(
      ["Morning briefing", "", "• Sweden: a vote on Tuesday. Ekot (sverigesradio.se)", "• See svt.se and code", "Quoted old words", "A chart", "", "plain"].join("\n")
    );
  });

  it("leaves what isn't markdown alone, including markup, which only ever goes in as text", () => {
    expect(plainFromMarkdown("snake_case_name and 2 * 3 * 4")).toBe("snake_case_name and 2 * 3 * 4");
    expect(plainFromMarkdown('<img src=x onerror="alert(1)">')).toBe('<img src=x onerror="alert(1)">');
    expect(plainFromMarkdown("")).toBe("");
  });
});
