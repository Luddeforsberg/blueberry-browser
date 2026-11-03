import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { Account } from "./Account";
import { GalleryServer, ServerError, Unreachable, type ServerSession } from "./galleryServer";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(Buffer.from(text).toString("hex")),
    decryptString: (data: Buffer) => Buffer.from(data.toString(), "hex").toString(),
  },
}));

const session = (name: string, expiresIn = 3_600_000): ServerSession => ({ accessToken: `access-${name}`, refreshToken: `refresh-${name}`, expiresAt: Date.now() + expiresIn, email: "ana@example.com" });
const fileIn = () => join(mkdtempSync(join(tmpdir(), "blueberry-account-")), "account.json");

const start = (server: Partial<GalleryServer>, file = fileIn()) => {
  const changes = vi.fn();
  return { account: new Account(server as GalleryServer, file, changes), changes, file };
};

describe("Account", () => {
  it("does nothing with no server", async () => {
    const account = new Account(null, fileIn(), () => {});
    expect(account.state.status).toBe("not-set-up");
    expect((await account.signIn("a@b.se", "pw")).status).toBe("not-set-up");
    expect(await account.accessToken()).toBeNull();
  });

  it("keeps the session encrypted and never in its state, and comes back signed in", async () => {
    const { account, file } = start({ signIn: async () => session("one") });
    const state = await account.signIn(" ana@example.com ", "hunter2-password");
    expect(state).toEqual({ status: "signed-in", email: "ana@example.com", problem: null });
    const saved = readFileSync(file, "utf8");
    expect(saved).not.toContain("access-one");
    expect(saved).not.toContain("hunter2");
    expect(Buffer.from(saved, "base64").toString()).not.toContain("access-one");
    expect(await start({}, file).account.accessToken()).toBe("access-one");
  });

  it.each([
    [new ServerError(400, "invalid_credentials"), "don’t match"],
    [new ServerError(422, "user_already_exists"), "already an account"],
    [new ServerError(429, "over_request_rate_limit"), "Too many"],
    [new ServerError(500, ""), "said no"],
    [new Unreachable(), "Couldn’t reach"],
  ])("puts a failed sign-in into words", async (error, words) => {
    const { account } = start({ signIn: async () => { throw error; } });
    const state = await account.signIn("a@b.se", "pw");
    expect(state.status).toBe("signed-out");
    expect(state.problem).toContain(words);
  });

  it("says to confirm when a sign-up gives no session, and asks for both fields first", async () => {
    const signUp = vi.fn(async () => null);
    const { account } = start({ signUp });
    expect((await account.signUp("", "pw")).problem).toContain("Enter your email");
    expect(signUp).not.toHaveBeenCalled();
    const state = await account.signUp("a@b.se", "pw");
    expect(state.status).toBe("signed-out");
    expect(state.problem).toContain("confirm");
  });

  it("refreshes a token about to end only once, however many ask", async () => {
    const refresh = vi.fn(async () => session("two"));
    const { account } = start({ signIn: async () => session("one", 30_000), refresh });
    await account.signIn("a@b.se", "pw");
    expect(await Promise.all([account.accessToken(), account.accessToken()])).toEqual(["access-two", "access-two"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await account.accessToken()).toBe("access-two");
  });

  it("signs out when the server has ended the session, but not when it can't be reached", async () => {
    const down = start({ signIn: async () => session("one", 30_000), refresh: async () => { throw new Unreachable(); } });
    await down.account.signIn("a@b.se", "pw");
    await expect(down.account.accessToken()).rejects.toBeInstanceOf(Unreachable);
    expect(down.account.state.status).toBe("signed-in");

    const ended = start({ signIn: async () => session("one", 30_000), refresh: async () => { throw new ServerError(400, "refresh_token_not_found"); } });
    await ended.account.signIn("a@b.se", "pw");
    expect(await ended.account.accessToken()).toBeNull();
    expect(ended.account.state).toMatchObject({ status: "signed-out", problem: expect.stringContaining("sign in again") });
  });

  // Each call waits for its own answer, which the test gives in whatever order it likes.
  const deferredSignIns = () => {
    const answers: ((session: ServerSession | Error) => void)[] = [];
    const signIn = vi.fn(() => new Promise<ServerSession>((resolve, reject) => answers.push((answer) => (answer instanceof Error ? reject(answer) : resolve(answer)))));
    return { signIn, answer: (index: number, session: ServerSession | Error) => answers[index](session) };
  };

  it("stays signed out when a sign-in that was on its way comes back afterwards, and ends that session there", async () => {
    const { signIn, answer } = deferredSignIns();
    const signOut = vi.fn(async () => {});
    const { account, file } = start({ signIn, signOut });
    const signingIn = account.signIn("a@b.se", "pw");
    await account.signOut();
    answer(0, session("late"));
    expect((await signingIn).status).toBe("signed-out");
    expect(await account.accessToken()).toBeNull();
    expect(() => readFileSync(file)).toThrow();
    expect(signOut).toHaveBeenCalledWith("access-late");
  });

  it("keeps the newest of two sign-ins, whichever answers last", async () => {
    const { signIn, answer } = deferredSignIns();
    const signOut = vi.fn(async () => {});
    const { account, file } = start({ signIn, signOut });
    const first = account.signIn("a@b.se", "pw");
    const second = account.signIn("a@b.se", "pw");
    answer(1, session("second"));
    expect((await second).status).toBe("signed-in");
    answer(0, session("first"));
    await first;
    expect(await account.accessToken()).toBe("access-second");
    expect(await start({}, file).account.accessToken()).toBe("access-second");
    expect(signOut).toHaveBeenCalledWith("access-first");

    // An older one failing late doesn't put a problem on the newer one.
    const third = account.signIn("a@b.se", "pw");
    const fourth = account.signIn("a@b.se", "pw");
    answer(3, session("fourth"));
    await fourth;
    answer(2, new ServerError(400, "invalid_credentials"));
    await third;
    expect(account.state).toEqual({ status: "signed-in", email: "ana@example.com", problem: null });
  });

  it("forgets the session here even if the server can't be told", async () => {
    const { account, file } = start({ signIn: async () => session("one"), signOut: async () => { throw new Unreachable(); } });
    await account.signIn("a@b.se", "pw");
    expect((await account.signOut()).status).toBe("signed-out");
    expect(() => readFileSync(file)).toThrow();
    expect(await account.accessToken()).toBeNull();
  });
});
