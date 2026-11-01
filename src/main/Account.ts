import { safeStorage } from "electron";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { AccountState } from "../shared/ipc";
import { ServerError, Unreachable, type GalleryServer, type ServerSession } from "./galleryServer";

// Who's signed in, for publishing. The session stays in here: main never sends a token to a renderer, no tool can reach
// this, and only the email goes out, to Settings. The password passes through one call and isn't kept or logged.

const REFRESH_BEFORE_MS = 60_000;

const NO_NETWORK = "Couldn’t reach the sign-in service. Try again in a moment.";
const SIGN_IN_AGAIN = "Your sign-in has ended. Please sign in again.";
const NOT_SAVED = "You’re signed in until you quit. This computer has no safe place to keep it, so you’ll sign in again next time.";
const CONFIRM_FIRST = "Check your email to confirm the address, then sign in here.";

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
const inWords = (error: unknown): string => {
  if (error instanceof Unreachable) return NO_NETWORK;
  if (error instanceof ServerError) return WORDS[error.code] ?? "The sign-in service said no. Try again in a moment.";
  return NO_NETWORK;
};

const isEnded = (error: unknown) => error instanceof ServerError && [400, 401, 403].includes(error.status);

export class Account {
  private session: ServerSession | null = null;
  private problem: string | null = null;
  private refreshing: Promise<string | null> | null = null;

  constructor(
    // Null when no server is set up, and then nothing here does anything.
    private readonly server: GalleryServer | null,
    private readonly file: string,
    private readonly onChange: () => void
  ) {
    if (server) this.session = this.load();
  }

  get state(): AccountState {
    if (!this.server) return { status: "not-set-up", email: null, problem: null };
    return this.session ? { status: "signed-in", email: this.session.email, problem: this.problem } : { status: "signed-out", email: null, problem: this.problem };
  }

  signIn(email: unknown, password: unknown): Promise<AccountState> {
    return this.start(email, password, (server, address, secret) => server.signIn(address, secret));
  }

  signUp(email: unknown, password: unknown): Promise<AccountState> {
    return this.start(email, password, (server, address, secret) => server.signUp(address, secret));
  }

  private async start(email: unknown, password: unknown, call: (server: GalleryServer, email: string, password: string) => Promise<ServerSession | null>): Promise<AccountState> {
    if (!this.server) return this.state;
    const address = typeof email === "string" ? email.trim() : "";
    const secret = typeof password === "string" ? password : "";
    if (!address || !secret) return this.say("Enter your email and a password.");
    try {
      const session = await call(this.server, address, secret);
      if (!session) return this.say(CONFIRM_FIRST);
      this.problem = null;
      this.keep(session);
    } catch (error) {
      return this.say(inWords(error));
    }
    this.onChange();
    return this.state;
  }

  // Forgets it here whatever the server says, as nothing else can be done about a server that can't be reached.
  async signOut(): Promise<AccountState> {
    const token = this.session?.accessToken;
    this.session = null;
    this.problem = null;
    this.forget();
    this.onChange();
    if (token) await this.server?.signOut(token).catch(() => console.error("Couldn't end the session on the server."));
    return this.state;
  }

  // A token that works for a while yet, or null if nobody's signed in. Throws if the server can't say.
  accessToken(): Promise<string | null> {
    const { session } = this;
    if (!session) return Promise.resolve(null);
    if (session.expiresAt - Date.now() > REFRESH_BEFORE_MS) return Promise.resolve(session.accessToken);
    // A refresh token works once, so two calls share one refresh.
    this.refreshing ??= this.refresh(session).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(session: ServerSession): Promise<string | null> {
    if (!this.server) return null;
    try {
      const fresh = await this.server.refresh(session.refreshToken, session.email);
      if (!fresh) throw new ServerError(400, "");
      if (this.session !== session) return this.session?.accessToken ?? null;
      this.keep(fresh);
      return fresh.accessToken;
    } catch (error) {
      if (!isEnded(error)) throw error;
      if (this.session === session) {
        this.session = null;
        this.forget();
        this.say(SIGN_IN_AGAIN);
      }
      return null;
    }
  }

  private say(problem: string): AccountState {
    this.problem = problem;
    this.onChange();
    return this.state;
  }

  private keep(session: ServerSession): void {
    this.session = session;
    if (!safeStorage.isEncryptionAvailable()) {
      this.problem = NOT_SAVED;
      return;
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, safeStorage.encryptString(JSON.stringify(session)).toString("base64"), { mode: 0o600 });
      renameSync(temp, this.file);
    } catch {
      this.problem = NOT_SAVED;
      console.error("Couldn't save the sign-in.");
    }
  }

  private load(): ServerSession | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const saved = JSON.parse(safeStorage.decryptString(Buffer.from(readFileSync(this.file, "utf8"), "base64")));
      const { accessToken, refreshToken, expiresAt, email } = saved;
      if (typeof accessToken !== "string" || typeof refreshToken !== "string" || typeof expiresAt !== "number" || typeof email !== "string") return null;
      return { accessToken, refreshToken, expiresAt, email };
    } catch {
      return null;
    }
  }

  private forget(): void {
    try {
      rmSync(this.file, { force: true });
    } catch {
      console.error("Couldn't remove the saved sign-in.");
    }
  }
}
