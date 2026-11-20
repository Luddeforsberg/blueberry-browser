import { describe, expect, it } from "vitest";
import { ServerError, Unreachable } from "../account/galleryServer";
import { startUntilAnswered, UNANSWERED } from "./startUntilAnswered";

// The server's first answer, then the job's id.
const after = (first: () => Promise<string | null>) => {
  let tries = 0;
  const send = () => (tries++ === 0 ? first() : Promise.resolve("job-1"));
  return { send, tries: () => tries };
};

describe("starting a job until the server answers", () => {
  it.each([400, 403, 404, 409])("takes a %i as the answer, and sends nothing more", async (status) => {
    const { send, tries } = after(() => Promise.reject(new ServerError(status, "")));
    await expect(startUntilAnswered(send, { going: () => true, waitMs: 1 })).rejects.toThrow(ServerError);
    expect(tries()).toBe(1);
  });

  it.each([
    ["no connection", () => Promise.reject(new Unreachable())],
    ["a server error", () => Promise.reject(new ServerError(500, ""))],
    ["a token that ran out", () => Promise.reject(new ServerError(401, ""))],
    ["too many calls", () => Promise.reject(new ServerError(429, ""))],
    ["no id", () => Promise.resolve(null)],
  ])("sends again after %s", async (_, first) => {
    const { send, tries } = after(first);
    expect(await startUntilAnswered(send, { going: () => true, waitMs: 1 })).toBe("job-1");
    expect(tries()).toBe(2);
  });

  it("stops once it shouldn't go on, without saying no job was made", async () => {
    const { send, tries } = after(() => Promise.reject(new Unreachable()));
    expect(await startUntilAnswered(send, { going: () => false, waitMs: 1 })).toBe(UNANSWERED);
    expect(tries()).toBe(1);
  });
});
