// Every call to the Gallery's server: Supabase's Auth and REST APIs, with nothing but `fetch`. Only the publishable key is
// ever here, and row-level security is what limits it. The email and password go to the sign-in calls and nowhere else,
// and no error passes on anything from a request or a reply but a status and a code.

const CALL_ABORT_MS = 10_000;
// Enough for a young gallery. The page sorts and searches what comes back, so past this it would miss the rest.
const LIST_LIMIT = 300;

const PUBLIC_COLUMNS = "id,name,palette,accessory,description,category,instructions,sites,tools,author_name,example_prompt,example_answer,add_count,created_at";

export interface ServerConfig {
  url: string;
  key: string;
}

// Null means the Gallery has no server, which is a normal way to run. A test can use a fake at 127.0.0.1 only in an app
// that isn't packaged, and anything but a publishable key is refused, so a secret key can't end up in here by mistake.
export const serverConfig = (url: string | undefined, key: string | undefined, packaged: boolean): ServerConfig | null => {
  if (!url || !key) return null;
  if (!key.startsWith("sb_publishable_")) {
    console.error("SUPABASE_PUBLISHABLE_KEY isn't a publishable key, so the Gallery stays local.");
    return null;
  }
  try {
    const { protocol, hostname } = new URL(url);
    const local = !packaged && protocol === "http:" && hostname === "127.0.0.1";
    return protocol === "https:" || local ? { url: url.replace(/\/$/, ""), key } : null;
  } catch {
    return null;
  }
};

// The address of a mascot's public page, or null until the site's address is set.
export const publicPageLink = (site: string | undefined, id: string): string | null => {
  if (!site) return null;
  try {
    const { protocol, hostname } = new URL(site);
    if (protocol !== "https:" && hostname !== "127.0.0.1") return null;
    return `${site.replace(/\/$/, "")}/m/?id=${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
};

export class ServerError extends Error {
  constructor(
    readonly status: number,
    // Auth's `error_code`. Empty when it gave none.
    readonly code: string
  ) {
    super(`The Gallery server answered ${status}`);
  }
}

export class Unreachable extends Error {
  constructor() {
    super("Couldn't reach the Gallery server");
  }
}

export interface ServerSession {
  accessToken: string;
  refreshToken: string;
  // When the access token stops working, in milliseconds.
  expiresAt: number;
  email: string;
}

const toSession = (body: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; user?: { email?: unknown } }, email = ""): ServerSession | null => {
  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, user } = body;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (typeof expiresIn === "number" ? expiresIn : 3600) * 1000,
    email: typeof user?.email === "string" ? user.email : email,
  };
};

export class GalleryServer {
  constructor(private readonly config: ServerConfig) {}

  private async request<T>(path: string, options: { method?: string; body?: unknown; token?: string | null; prefer?: string } = {}): Promise<T> {
    let response: Response;
    let text: string;
    try {
      response = await fetch(`${this.config.url}${path}`, {
        method: options.method ?? "GET",
        headers: {
          // A publishable key goes in `apikey` only. `Authorization` is for a user's own token.
          apikey: this.config.key,
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          ...(options.prefer ? { prefer: options.prefer } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(CALL_ABORT_MS),
      });
      text = await response.text();
    } catch {
      throw new Unreachable();
    }
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // A server error can be a page of HTML. The status says enough.
    }
    if (!response.ok) {
      const code = (parsed as { error_code?: unknown } | null)?.error_code;
      throw new ServerError(response.status, typeof code === "string" ? code : "");
    }
    return parsed as T;
  }

  // Null if it worked but there's no session, which is what a project that wants the address confirmed first answers.
  async signUp(email: string, password: string): Promise<ServerSession | null> {
    return toSession(await this.request("/auth/v1/signup", { method: "POST", body: { email, password } }), email);
  }

  async signIn(email: string, password: string): Promise<ServerSession | null> {
    return toSession(await this.request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }), email);
  }

  async refresh(refreshToken: string, email: string): Promise<ServerSession | null> {
    return toSession(await this.request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } }), email);
  }

  async signOut(token: string): Promise<void> {
    await this.request("/auth/v1/logout?scope=local", { method: "POST", token });
  }

  // Newest first, with the public key alone, so a hidden row can't come back to its author here.
  async listMascots(): Promise<unknown[]> {
    return (await this.request<unknown[]>(`/rest/v1/mascots?select=${PUBLIC_COLUMNS}&order=created_at.desc&limit=${LIST_LIMIT}`)) ?? [];
  }

  async myMascots(token: string): Promise<unknown[]> {
    return (await this.request<unknown[]>("/rest/v1/rpc/my_mascots", { method: "POST", body: {}, token })) ?? [];
  }

  async insertMascot(token: string, row: object): Promise<string | null> {
    const rows = await this.request<{ id?: unknown }[]>("/rest/v1/mascots?select=id", { method: "POST", body: row, token, prefer: "return=representation" });
    const id = rows?.[0]?.id;
    return typeof id === "string" ? id : null;
  }

  // False if no row was changed, because it's gone or isn't this user's.
  async updateMascot(token: string, id: string, row: object): Promise<boolean> {
    const rows = await this.request<unknown[]>(`/rest/v1/mascots?id=eq.${encodeURIComponent(id)}&select=id`, { method: "PATCH", body: row, token, prefer: "return=representation" });
    return (rows?.length ?? 0) > 0;
  }

  async deleteMascot(token: string, id: string): Promise<boolean> {
    const rows = await this.request<unknown[]>(`/rest/v1/mascots?id=eq.${encodeURIComponent(id)}&select=id`, { method: "DELETE", token, prefer: "return=representation" });
    return (rows?.length ?? 0) > 0;
  }

  async recordAdd(token: string | null, mascot: string, install: string): Promise<void> {
    await this.request("/rest/v1/rpc/record_add", { method: "POST", body: { p_mascot: mascot, p_install: install }, token });
  }
}
