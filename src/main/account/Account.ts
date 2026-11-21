import { safeStorage } from "electron";
import type { AccountState } from "../../shared/ipc";
import { Latest } from "../../shared/lateWork";
import { bestEffort, readTextFile, removeFile, saveFile, type Saved } from "../library/savedFile";
import { ServerError, type GalleryServer, type ServerSession } from "./galleryServer";
import { fieldsOf } from "../../shared/fields";

// Who's signed in, for publishing. The session stays in here: main never sends a token to a renderer, no tool can reach
// this, and only the email goes out, to Settings. The password passes through one call and isn't kept or logged.

const REFRESH_BEFORE_MS = 60_000;

const NO_NETWORK = "Couldn’t reach the sign-in service. Try again in a moment.";
const SIGN_IN_AGAIN = "Your sign-in has ended. Please sign in again.";
const NOT_SAVED = "You’re signed in until you quit. This computer has no safe place to keep it, so you’ll sign in again next time.";
const NOT_WRITTEN = "You’re signed in until you quit. This couldn’t be saved on this computer, so you’ll sign in again next time.";
const EARLIER_KEPT =
  "You’re signed in until you quit. This couldn’t be saved on this computer, and an earlier sign-in still is, so that’s the one you’ll have after a restart.";
const NOT_FORGOTTEN =
  "You’re signed out for now, but the saved sign-in couldn’t be removed from this computer, so you’ll be signed in again after a restart. Sign in and out again to try once more.";
const CONFIRM_FIRST = "Check your email to confirm the address, then sign in here.";

const SHORT_PASSWORD = "Use at least 8 characters.";
const MIN_PASSWORD = 8;

const WORDS: Record<string, string> = {
  invalid_credentials: "That email and password don’t match an account.",
  email_not_confirmed: "This address isn’t confirmed yet. Use the link in the email you got, then sign in here.",
  user_already_exists: "There’s already an account with that email. Sign in instead.",
  email_exists: "There’s already an account with that email. Sign in instead.",
  weak_password: "Choose a longer, harder password.",
  validation_failed: "That doesn’t look like an email address.",
  over_request_rate_limit: "Too many tries. Wait a few minutes.",
  over_email_send_rate_limit: "Too many emails were sent. Wait a while before trying again.",
  signup_disabled: "New accounts are turned off on this server.",
  email_provider_disabled: "Email sign-in is turned off on this server.",
};
// The field each problem is about, so the form says it under that one.
const ABOUT: Record<string, AccountState["problemAbout"]> = {
  invalid_credentials: "password",
  email_not_confirmed: "email",
  user_already_exists: "email",
  email_exists: "email",
  weak_password: "password",
  validation_failed: "email",
};
const inWords = (error: unknown): [string, AccountState["problemAbout"]] => {
  if (error instanceof ServerError)
    return [WORDS[error.code] ?? "The sign-in service said no. Try again in a moment.", ABOUT[error.code] ?? null];
  return [NO_NETWORK, null];
};

const isEnded = (error: unknown) => error instanceof ServerError && [400, 401, 403].includes(error.status);

export class Account {
  private session: ServerSession | null = null;
  private problem: string | null = null;
  private problemAbout: AccountState["problemAbout"] = null;
  // A refresh token works once, so calls for one session share its refresh.
  private refreshing: { session: ServerSession; token: Promise<string | null> } | null = null;
  // Only the newest sign-in or sign-out counts, so the answer to one that's been overtaken changes nothing.
  private readonly signIns = new Latest();

  constructor(
    // Null when no server is set up, and then nothing here does anything.
    private readonly server: GalleryServer | null,
    private readonly file: string,
    private readonly onChange: () => void,
  ) {
    if (server) this.session = this.load();
  }

  get state(): AccountState {
    if (!this.server) return { status: "not-set-up", email: null, problem: null, problemAbout: null };
    const { problem, problemAbout } = this;
    return this.session
      ? { status: "signed-in", email: this.session.email, problem, problemAbout }
      : { status: "signed-out", email: null, problem, problemAbout };
  }

  signIn(email: unknown, password: unknown): Promise<AccountState> {
    return this.start(email, password, (server, address, secret) => server.signIn(address, secret));
  }

  signUp(email: unknown, password: unknown): Promise<AccountState> {
    return this.start(email, password, (server, address, secret) => server.signUp(address, secret), MIN_PASSWORD);
  }

  private async start(
    email: unknown,
    password: unknown,
    call: (server: GalleryServer, email: string, password: string) => Promise<ServerSession | null>,
    minLength = 0,
  ): Promise<AccountState> {
    if (!this.server) return this.state;
    const address = typeof email === "string" ? email.trim() : "";
    const secret = typeof password === "string" ? password : "";
    if (!address || !secret) return this.say("Enter your email and a password.");
    if (secret.length < minLength) return this.say(SHORT_PASSWORD, "password");
    const turn = this.signIns.next();
    try {
      const session = await call(this.server, address, secret);
      // Signed out, or in again, while it was on its way. Its session is ended there, as nobody here will use it.
      if (!turn.current) {
        if (session) void this.server.signOut(session.accessToken).catch(() => console.error("Couldn't end the session on the server."));
        return this.state;
      }
      if (!session) return this.say(CONFIRM_FIRST);
      this.problem = null;
      this.problemAbout = null;
      this.keep(session);
    } catch (error) {
      return turn.current ? this.say(...inWords(error)) : this.state;
    }
    this.onChange();
    return this.state;
  }

  // Forgets it here whatever the server says, as nothing else can be done about a server that can't be reached.
  async signOut(): Promise<AccountState> {
    this.signIns.end();
    const token = this.session?.accessToken;
    this.session = null;
    this.problem = this.forget() ? null : NOT_FORGOTTEN;
    this.problemAbout = null;
    this.onChange();
    if (token) await this.server?.signOut(token).catch(() => console.error("Couldn't end the session on the server."));
    return this.state;
  }

  // A token that works for a while yet for whoever is signed in now, or null if nobody is, or if they sign out or someone
  // else signs in before it's here. Throws if the server can't say.
  accessToken(): Promise<string | null> {
    const { session } = this;
    if (!session) return Promise.resolve(null);
    if (session.expiresAt - Date.now() > REFRESH_BEFORE_MS) return Promise.resolve(session.accessToken);
    if (this.refreshing?.session === session) return this.refreshing.token;
    const token = this.refresh(session).finally(() => {
      if (this.refreshing?.token === token) this.refreshing = null;
    });
    this.refreshing = { session, token };
    return token;
  }

  private async refresh(session: ServerSession): Promise<string | null> {
    if (!this.server) return null;
    try {
      const fresh = await this.server.refresh(session.refreshToken, session.email);
      if (!fresh) throw new ServerError(400, "");
      // The session it was for has gone, and the caller asked as that account, so it gets nobody's token.
      if (this.session !== session) return null;
      this.keep(fresh);
      return fresh.accessToken;
    } catch (error) {
      if (!isEnded(error)) throw error;
      if (this.session === session) {
        this.session = null;
        // One left on file has ended too, so the next launch only asks again.
        bestEffort(this.forget(), "The ended sign-in is still on file, and the next launch finds it has ended too.");
        this.say(SIGN_IN_AGAIN);
      }
      return null;
    }
  }

  private say(problem: string, about: AccountState["problemAbout"] = null): AccountState {
    this.problem = problem;
    this.problemAbout = about;
    this.onChange();
    return this.state;
  }

  private keep(session: ServerSession): void {
    this.session = session;
    if (!safeStorage.isEncryptionAvailable()) {
      this.problem = NOT_SAVED;
      return;
    }
    const sealed = () => safeStorage.encryptString(JSON.stringify(session)).toString("base64");
    // One left on file from before, perhaps another account's, would be who the next launch signs in as.
    if (!saveFile(this.file, sealed, { secret: true })) this.problem = this.forget() ? NOT_WRITTEN : EARLIER_KEPT;
  }

  private load(): ServerSession | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const saved = readTextFile(this.file);
      if (saved === undefined) return null;
      const text = safeStorage.decryptString(Buffer.from(saved, "base64"));
      const { accessToken, refreshToken, expiresAt, email } = fieldsOf(JSON.parse(text));
      if (typeof accessToken !== "string" || typeof refreshToken !== "string" || typeof expiresAt !== "number" || typeof email !== "string")
        return null;
      return { accessToken, refreshToken, expiresAt, email };
    } catch {
      return null;
    }
  }

  // False if the saved sign-in is still on file.
  private forget(): Saved {
    return removeFile(this.file, { secret: true });
  }
}
