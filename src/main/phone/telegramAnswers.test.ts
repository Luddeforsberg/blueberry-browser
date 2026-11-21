import { describe, expect, it } from "vitest";
import { updatesOf } from "./telegramAnswers";

describe("updatesOf", () => {
  it("keeps an update whatever is wrong inside it, so the poll moves past it", () => {
    expect(updatesOf([])).toEqual([]);
    expect(updatesOf([{ update_id: 7, message: { message_id: "1", chat: { id: 5, type: "private" } } }])).toEqual([{ update_id: 7 }]);
    expect(updatesOf([{ update_id: 8, callback_query: { id: "q", from: { id: "5" }, data: "yes" } }])).toEqual([{ update_id: 8 }]);
  });

  // One it can't move past would come back at once, every time it asked.
  it.each([null, {}, [{ update_id: "9" }], [{ update_id: 9 }, {}]])("refuses %j", (result) => {
    expect(updatesOf(result)).toBeNull();
  });
});
