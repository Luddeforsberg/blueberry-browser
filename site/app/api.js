import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config.js";

// The phone page's only way to Supabase: the publishable key and the user's own session, as Blueberry's Account does, so
// row-level security keeps everything to their own. The session is kept in localStorage, the best a phone browser offers.
// Nothing here ever sends a code: there's no field for one.

const KEPT = "blueberry.session";
const REFRESH_BEFORE_MS = 60_000;

export const configured = () => !!SUPABASE_URL && !!SUPABASE_PUBLISHABLE_KEY;

export class ApiError extends Error {
  constructor(status, message = "") {
    super(message || `Answered ${status}`);
    this.status = status;
  }
}

const read = () => {
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT) ?? "null");
    return kept && typeof kept.accessToken === "string" && typeof kept.refreshToken === "string" ? kept : null;
  } catch {
    return null;
  }
};

let session = read();
// Changes whenever someone signs in or out, so an answer to a call made before can be dropped rather than bring the
// last account back.
let version = 0;
export const sessionVersion = () => version;
const keep = (next, { same = false } = {}) => {
  if (!same) version++;
  session = next;
  try {
    if (next) localStorage.setItem(KEPT, JSON.stringify(next));
    else localStorage.removeItem(KEPT);
  } catch {
    // A private window: signed in until the page closes.
  }
};

export const signedIn = () => (session ? { email: session.email, userId: session.userId } : null);

const send = async (path, { method = "GET", body, token } = {}) => {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0);
  }
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // An error page. The status says enough.
  }
  if (!response.ok) throw new ApiError(response.status, typeof parsed?.message === "string" ? parsed.message : "");
  return parsed;
};

const toSession = (body) => {
  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, user } = body ?? {};
  if (typeof accessToken !== "string" || typeof refreshToken !== "string" || typeof user?.id !== "string") return null;
  return { accessToken, refreshToken, expiresAt: Date.now() + (typeof expiresIn === "number" ? expiresIn : 3600) * 1000, email: String(user.email ?? ""), userId: user.id };
};

export const signIn = async (email, password) => {
  const next = toSession(await send("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }));
  if (!next) throw new ApiError(400);
  keep(next);
};

export const signOut = async () => {
  const token = session?.accessToken;
  keep(null);
  if (token) await send("/auth/v1/logout", { method: "POST", token }).catch(() => {});
};

// A refresh token works once, so callers at the same time share one refresh. A refused one signs out.
let refreshing = null;
const token = async () => {
  if (!session) throw new ApiError(401);
  if (session.expiresAt - Date.now() > REFRESH_BEFORE_MS) return session.accessToken;
  const asked = version;
  refreshing ??= send("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refreshToken } })
    .then((body) => {
      // Signed out, or in as someone else, while it was out: this one isn't theirs.
      if (version !== asked) throw new ApiError(401);
      const next = toSession(body);
      if (!next) throw new ApiError(401);
      keep(next, { same: true });
    })
    .catch((error) => {
      if (version === asked && (error.status === 400 || error.status === 401)) keep(null);
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  await refreshing;
  return session.accessToken;
};

const asUser = async (path, options = {}) => {
  const asked = version;
  try {
    return await send(path, { ...options, token: await token() });
  } catch (error) {
    // A session the server no longer takes, unless it's already been replaced.
    if (error.status === 401 && version === asked) keep(null);
    throw error;
  }
};

export const rpc = (name, body = {}) => asUser(`/rest/v1/rpc/${name}`, { method: "POST", body });

const JOB_COLUMNS = "id,prompt,mascot,status,steps,reply,error,live_view_url,context_id,created_at,updated_at";

// The user's newest jobs, then what each waiting one is asking.
export const jobs = async () => {
  const me = encodeURIComponent(session?.userId ?? "");
  const rows = (await asUser(`/rest/v1/cloud_jobs?select=${JOB_COLUMNS}&owner=eq.${me}&order=created_at.desc&limit=30`)) ?? [];
  const waiting = rows.filter((row) => row.status === "waiting").map((row) => row.id);
  const asks = waiting.length ? ((await rpc("my_cloud_jobs", { p_ids: waiting })) ?? []) : [];
  return rows.map((row) => ({ ...row, ask: asks.find((ask) => ask.id === row.id && typeof ask.approval_id === "string") ?? null }));
};

export const flock = async () => (await asUser("/rest/v1/cloud_flock?select=id,name,palette,accessory,instructions,sites,tools,from_gallery,updated_at&order=position")) ?? [];

export const runner = async () => ((await rpc("my_cloud_runner")) ?? [])[0] ?? null;
