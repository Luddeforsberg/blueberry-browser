import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config.js";
import { fetchWithin, Latest } from "../shared.js";

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
// Who the page is for. Each sign-in or sign-out starts a new turn, so an answer to a call made before it is dropped rather
// than bring the last account back, and whatever is listening forgets what it knew of that account. It's the same
// transition however the account goes: signing out, a session the server stops taking, or someone else signing in.
const accounts = new Latest();
let account = accounts.next();
export const accountTurn = () => account;
const accountChanged = new Set();
export const onAccountChange = (listener) => {
  accountChanged.add(listener);
  return () => accountChanged.delete(listener);
};
const keep = (next, { same = false } = {}) => {
  session = next;
  try {
    if (next) localStorage.setItem(KEPT, JSON.stringify(next));
    else localStorage.removeItem(KEPT);
  } catch {
    // A private window: signed in until the page closes.
  }
  if (same) return;
  account = accounts.next();
  for (const listener of accountChanged) listener();
};

export const signedIn = () => (session ? { email: session.email, userId: session.userId } : null);

// A call that takes too long fails as if the server couldn't be reached, so nothing waits on it for good.
const send = async (path, { method = "GET", body, token } = {}) => {
  let response;
  try {
    response = await fetchWithin(`${SUPABASE_URL}${path}`, {
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
  const { text } = response;
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // An error page says enough by its status. A success that can't be read is a failure too, never an empty answer.
    if (response.ok) throw new ApiError(response.status, "The answer couldn’t be read");
  }
  if (!response.ok) throw new ApiError(response.status, typeof parsed?.message === "string" ? parsed.message : "");
  return parsed;
};

// A list the server must answer with. Anything else fails as a call does, so it never reads as an empty account.
const listOf = (answer) => {
  if (!Array.isArray(answer)) throw new ApiError(200, "The answer wasn’t a list");
  return answer;
};

const toSession = (body) => {
  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, user } = body ?? {};
  if (typeof accessToken !== "string" || typeof refreshToken !== "string" || typeof user?.id !== "string") return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (typeof expiresIn === "number" ? expiresIn : 3600) * 1000,
    email: String(user.email ?? ""),
    userId: user.id,
  };
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

// A refresh token works once, so callers at the same time share one refresh. A refused one signs out. One that fails or
// runs out of time is let go, so the next call tries again.
let refreshing = null;
const token = async () => {
  if (!session) throw new ApiError(401);
  if (session.expiresAt - Date.now() > REFRESH_BEFORE_MS) return session.accessToken;
  const asked = account;
  refreshing ??= send("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refreshToken } })
    .then((body) => {
      // Signed out, or in as someone else, while it was out: this one isn't theirs.
      if (!asked.current) throw new ApiError(401);
      const next = toSession(body);
      if (!next) throw new ApiError(401);
      keep(next, { same: true });
    })
    .catch((error) => {
      if (asked.current && (error.status === 400 || error.status === 401)) keep(null);
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  await refreshing;
  return session.accessToken;
};

const asUser = async (path, options = {}) => {
  const asked = account;
  try {
    return await send(path, { ...options, token: await token() });
  } catch (error) {
    // A session the server no longer takes, unless it's already been replaced.
    if (error.status === 401 && asked.current) keep(null);
    throw error;
  }
};

export const rpc = (name, body = {}) => asUser(`/rest/v1/rpc/${name}`, { method: "POST", body });

const JOB_COLUMNS = "id,conversation_id,prompt,mascot,status,steps,reply,error,live_view_url,context_id,created_at,updated_at";

// The user's newest jobs in the cloud, and every one still going however old, then what each waiting one is asking. The
// page puts them together into conversations. One run on the Mac is answered there, so it isn't here.
export const jobs = async () => {
  const me = encodeURIComponent(session?.userId ?? "");
  const mine = `/rest/v1/cloud_jobs?select=${JOB_COLUMNS}&owner=eq.${me}&target=eq.cloud&order=created_at.desc`;
  // The history is cut at a hundred, so a job waiting since before the hundred newest is asked for on its own.
  const [newest, going] = await Promise.all([
    asUser(`${mine}&limit=100`).then(listOf),
    asUser(`${mine}&status=in.(queued,running,waiting)`).then(listOf),
  ]);
  const rows = [...newest, ...going.filter((row) => !newest.some((known) => known.id === row.id))];
  const waiting = rows.filter((row) => row.status === "waiting").map((row) => row.id);
  const asks = waiting.length ? listOf(await rpc("my_cloud_jobs", { p_ids: waiting })) : [];
  return rows.map((row) => ({ ...row, ask: asks.find((ask) => ask.id === row.id && typeof ask.approval_id === "string") ?? null }));
};

// One job with the history it carried, which only a follow-up needs, so the list doesn't fetch it for every job.
export const jobWithHistory = async (id) => {
  const me = encodeURIComponent(session?.userId ?? "");
  const [row] = listOf(
    await asUser(
      `/rest/v1/cloud_jobs?select=id,conversation_id,prompt,history,steps,reply,created_at&owner=eq.${me}&id=eq.${encodeURIComponent(id)}&limit=1`,
    ),
  );
  return row ?? null;
};

export const mascots = async () =>
  listOf(
    await asUser("/rest/v1/cloud_mascots?select=id,name,palette,accessory,instructions,sites,tools,from_gallery,updated_at&order=position"),
  );

export const runner = async () => listOf(await rpc("my_cloud_runner"))[0] ?? null;
