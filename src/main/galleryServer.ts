// Every call to the Gallery's server: Supabase's Auth and REST APIs, with nothing but `fetch`. Only the publishable key is
// ever here, and row-level security is what limits it. The email and password go to the sign-in calls and nowhere else,
// and no error passes on anything from a request or a reply but a status and a code.

import type { CloudRoutineRow } from "./cloudJobs";

const CALL_ABORT_MS = 10_000;
// Enough for a young gallery. The page sorts and searches what comes back, so past this it would miss the rest.
const LIST_LIMIT = 300;
// A conversation's jobs come this many at a time, up to this many pages, far past any real conversation.
const CONVERSATION_PAGE = 100;
const CONVERSATION_PAGES = 50;

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

// The relay's address as the runner wrote it, only if it's an https one ending in /mcp, and nothing else about it.
export const relayAddress = (input: unknown): string | null => {
  if (typeof input !== "string" || input.length > 300) return null;
  try {
    const url = new URL(input);
    return url.protocol === "https:" && url.pathname === "/mcp" && !url.search && !url.hash && !url.username && !url.password ? url.href : null;
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

  // The cloud runner's jobs, always as the signed-in user, so row-level security keeps each to their own.

  // `afterJobId` is the conversation's newest job, the one the history was built on. Answers 409 while another job of it
  // is going, or if it has gone on since that one.
  async startCloudJob(
    token: string,
    job: { prompt: string; history: unknown[]; mascot: object; actionApproval: string; contextId: string | null; conversationId: string; afterJobId: string | null }
  ): Promise<string | null> {
    const id = await this.request<unknown>("/rest/v1/rpc/start_cloud_job", {
      method: "POST",
      token,
      body: { p_prompt: job.prompt, p_history: job.history, p_mascot: job.mascot, p_action_approval: job.actionApproval, p_context_id: job.contextId, p_conversation: job.conversationId, p_after_job: job.afterJobId },
    });
    return typeof id === "string" ? id : null;
  }

  async cloudJobs(token: string, ids: string[]): Promise<Record<string, unknown>[]> {
    return (await this.request<Record<string, unknown>[]>("/rest/v1/rpc/my_cloud_jobs", { method: "POST", token, body: { p_ids: ids } })) ?? [];
  }

  async stopCloudJob(token: string, id: string): Promise<void> {
    await this.request("/rest/v1/rpc/stop_cloud_job", { method: "POST", token, body: { p_job: id } });
  }

  // The user's own answer, the only way one is ever written. False if it was already answered or no longer waiting.
  async decideCloudApproval(token: string, id: string, allow: boolean, answer: string | null): Promise<boolean> {
    return (await this.request<unknown>("/rest/v1/rpc/decide_cloud_approval", { method: "POST", token, body: { p_approval: id, p_allow: allow, p_answer: answer } })) === true;
  }

  // Every job of a conversation, so a chat deleted here doesn't come back as one started elsewhere.
  async forgetCloudConversation(token: string, id: string): Promise<void> {
    await this.request("/rest/v1/rpc/forget_cloud_conversation", { method: "POST", token, body: { p_conversation: id } });
  }

  // The newest jobs that belong to a conversation, so one started or followed up elsewhere shows here. Ids only.
  async cloudConversationJobs(token: string): Promise<{ id: string; conversation_id: string; created_at: string }[]> {
    const rows = (await this.request<Record<string, unknown>[]>("/rest/v1/cloud_jobs?select=id,conversation_id,created_at&conversation_id=not.is.null&order=created_at.desc&limit=50", { token })) ?? [];
    return rows.filter((row): row is { id: string; conversation_id: string; created_at: string } => typeof row.id === "string" && typeof row.conversation_id === "string" && typeof row.created_at === "string");
  }

  // Every job of one conversation, oldest first, with what each asked and how it went, a page at a time.
  async cloudConversation(token: string, id: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (let page = 0; page < CONVERSATION_PAGES; page++) {
      const path = `/rest/v1/cloud_jobs?select=id,prompt,mascot,status,steps,reply,error,created_at&conversation_id=eq.${encodeURIComponent(id)}&order=created_at.asc&limit=${CONVERSATION_PAGE}&offset=${page * CONVERSATION_PAGE}`;
      const batch = (await this.request<Record<string, unknown>[]>(path, { token })) ?? [];
      rows.push(...batch);
      if (batch.length < CONVERSATION_PAGE) break;
    }
    return rows;
  }

  // The user's runner: an account of its own, named by email, which counts once the runner has accepted.

  async linkCloudRunner(token: string, email: string): Promise<boolean> {
    return (await this.request<unknown>("/rest/v1/rpc/link_cloud_runner", { method: "POST", token, body: { p_email: email } })) === true;
  }

  async unlinkCloudRunner(token: string): Promise<void> {
    await this.request("/rest/v1/rpc/unlink_cloud_runner", { method: "POST", token, body: {} });
  }

  // The flock as the phone page sees it, replaced whole. Mascot fields only, never memory.
  async syncCloudFlock(token: string, birds: object[]): Promise<void> {
    await this.request("/rest/v1/rpc/sync_cloud_flock", { method: "POST", token, body: { p_birds: birds } });
  }

  async syncCloudRoutine(token: string, row: CloudRoutineRow): Promise<void> {
    await this.request("/rest/v1/rpc/sync_cloud_routine", {
      method: "POST",
      token,
      body: { p_key: row.key, p_prompt: row.prompt, p_mascot: row.mascot, p_action_approval: row.actionApproval, p_context_id: row.contextId, p_schedule: row.schedule, p_time_zone: row.timeZone, p_paused: row.paused, p_first_run_at: row.firstRunAt },
    });
  }

  // The keys of the user's routines in the cloud, whatever this app remembers sending.
  async myCloudRoutineKeys(token: string): Promise<string[]> {
    const keys = await this.request<unknown[]>("/rest/v1/rpc/my_cloud_routine_keys", { method: "POST", token, body: {} });
    return (keys ?? []).filter((key): key is string => typeof key === "string");
  }

  async forgetCloudRoutine(token: string, key: string): Promise<void> {
    await this.request("/rest/v1/rpc/forget_cloud_routine", { method: "POST", token, body: { p_key: key } });
  }

  // The relay's grant, made once as the owner from its sign-in page, whose secret only the relay keeps.
  async createRelayGrant(token: string): Promise<string> {
    const secret = await this.request<unknown>("/rest/v1/rpc/create_relay_grant", { method: "POST", token, body: {} });
    if (typeof secret !== "string") throw new ServerError(500, "");
    return secret;
  }

  // Every app connected through the relay has to connect again.
  async revokeRelayGrants(token: string): Promise<void> {
    await this.request("/rest/v1/rpc/revoke_relay_grants", { method: "POST", token, body: {} });
  }

  // `relayUrl` is where ChatGPT or Claude connect, which the runner gives once it has accepted. Only an https one.
  async myCloudRunner(token: string): Promise<{ email: string; accepted: boolean; relayUrl: string | null } | null> {
    const [row] = (await this.request<{ email?: unknown; accepted?: unknown; relay_url?: unknown }[]>("/rest/v1/rpc/my_cloud_runner", { method: "POST", token, body: {} })) ?? [];
    return row && typeof row.email === "string" ? { email: row.email, accepted: row.accepted === true, relayUrl: relayAddress(row.relay_url) } : null;
  }
}
