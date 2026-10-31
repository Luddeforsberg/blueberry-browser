import { describe, expect, it } from "vitest";
import { bindReply, chooseCodeField, plausibleCode, type CodeField, type OpenRequest } from "./phoneReplies";

const field = (overrides: Partial<CodeField> = {}): CodeField => ({ autocomplete: "", words: "", type: "text", maxLength: -1, ...overrides });

describe("plausibleCode", () => {
  it.each([
    ["1234", "1234"],
    ["123456", "123456"],
    [" 123 456 ", "123456"],
    ["123-456", "123456"],
    ["ab12cd", "ab12cd"],
    ["ABCDEF", "ABCDEF"],
    ["123456789012", "123456789012"],
  ])("takes %j", (text, code) => expect(plausibleCode(text)).toBe(code));

  it.each(["", "   ", "123", "1234567890123", "1 2 3 4", "12--34", "thanks", "hunter two", "123456!", "correct horse", "https://a.b/123456", "123456\n789"])(
    "refuses %j",
    (text) => expect(plausibleCode(text)).toBeNull()
  );
});

describe("bindReply", () => {
  const code = (handle: string): OpenRequest => ({ handle, kind: "code" });
  const question = (handle: string): OpenRequest => ({ handle, kind: "question" });
  const approval = (handle: string): OpenRequest => ({ handle, kind: "approval" });

  it("gives a plain message to the only request that takes one", () => {
    const only = code("1");
    expect(bindReply("123456", null, [only, approval("2")])).toEqual({ to: only });
  });

  it("wants a reply to the message when two codes wait, and takes the one named", () => {
    const first = code("1");
    const second = code("2");
    expect(bindReply("123456", null, [first, second])).toEqual({ refused: "which-one" });
    expect(bindReply("123456", "2", [first, second])).toEqual({ to: second });
  });

  it("never lets a stray code reach a question", () => {
    const asked = question("1");
    expect(bindReply("123456", null, [asked])).toEqual({ refused: "looks-like-a-code" });
    expect(bindReply("the blue one", null, [asked])).toEqual({ to: asked });
    expect(bindReply("SK1420", "1", [asked])).toEqual({ to: asked });
    expect(bindReply("123456", null, [asked, code("2")])).toEqual({ refused: "which-one" });
  });

  it("accepts nothing for a request that's closed or takes no reply", () => {
    expect(bindReply("123456", "9", [code("1")])).toEqual({ refused: "closed" });
    expect(bindReply("yes", "1", [approval("1")])).toEqual({ refused: "not-by-reply" });
    expect(bindReply("yes", null, [approval("1")])).toEqual({ refused: "not-by-reply" });
    expect(bindReply("yes", null, [])).toEqual({ refused: "nothing-waiting" });
  });
});

describe("chooseCodeField", () => {
  const boxes = (count: number) => Array.from({ length: count }, () => field({ maxLength: 1 }));

  it("prefers the field marked for one-time codes", () => {
    const fields = [field({ words: "code" }), field({ autocomplete: "one-time-code" })];
    expect(chooseCodeField(fields, "123456", false)).toEqual({ kind: "one", index: 1 });
  });

  it("goes by an obvious name, and not by one that means something else", () => {
    expect(chooseCodeField([field({ words: "email" }), field({ words: "Verification code" })], "123456", false)).toEqual({ kind: "one", index: 1 });
    expect(chooseCodeField([field({ words: "postal code" })], "123456", false)).toBeNull();
  });

  it("takes the only field, unless it's for something else or a password sits beside it", () => {
    expect(chooseCodeField([field({ words: "answer" })], "123456", false)).toEqual({ kind: "one", index: 0 });
    expect(chooseCodeField([field({ words: "answer" })], "123456", true)).toBeNull();
    expect(chooseCodeField([field({ words: "Search" })], "123456", false)).toBeNull();
    expect(chooseCodeField([field({ words: "Email", autocomplete: "username" })], "123456", false)).toBeNull();
    expect(chooseCodeField([], "123456", false)).toBeNull();
  });

  it("types nothing when two fields could be it", () => {
    expect(chooseCodeField([field({ words: "code" }), field({ words: "pin" })], "123456", false)).toBeNull();
    expect(chooseCodeField([field(), field()], "123456", false)).toBeNull();
    expect(chooseCodeField([field({ autocomplete: "one-time-code" }), field({ autocomplete: "one-time-code" })], "123456", false)).toBeNull();
  });

  it("fills boxes only when there's one for every character", () => {
    expect(chooseCodeField(boxes(6), "123456", false)).toEqual({ kind: "boxes", indexes: [0, 1, 2, 3, 4, 5] });
    expect(chooseCodeField(boxes(5), "123456", false)).toBeNull();
    expect(chooseCodeField(boxes(7), "123456", false)).toBeNull();
  });

  it("finds a row of boxes when only the first is marked", () => {
    const fields = [field({ maxLength: 1, autocomplete: "one-time-code" }), ...boxes(3)];
    expect(chooseCodeField(fields, "1234", false)).toEqual({ kind: "boxes", indexes: [0, 1, 2, 3] });
  });

  it("won't use a field that couldn't hold the code", () => {
    expect(chooseCodeField([field({ autocomplete: "one-time-code", maxLength: 4 })], "123456", false)).toBeNull();
    expect(chooseCodeField([field({ autocomplete: "one-time-code", type: "number" })], "AB1234", false)).toBeNull();
    expect(chooseCodeField([field({ autocomplete: "one-time-code", type: "number" })], "123456", false)).toEqual({ kind: "one", index: 0 });
  });
});
