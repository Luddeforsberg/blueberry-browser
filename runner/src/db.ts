import type { ReplyMessage } from "../../src/main/chats/agent";
import {
  actionApprovalFromRow,
  fitJobUpdate,
  historyFromRow,
  type ApprovalToAsk,
  type CloudJobStatus,
} from "../../src/main/remoteJobs/cloudJobs";
import type { ActionApproval } from "../../src/shared/ipc";
import { fieldsOf } from "../../src/shared/fields";
import { GalleryServer, type ServerSession } from "../../src/main/account/galleryServer";
import type { ChatStep } from "../../src/shared/library";
import type { PushDb, PushSubscriptionRow } from "./push";
import type { DueRoutine, RoutineDb } from "./routines";

// The runner's only way to Supabase: signed in as its own user, with the publishable key, through the `runner_*`
// functions, which only reach the jobs of the owner it's linked to. Nothing here can decide an approval, and the database
// refuses it too. No error passes on anything from a reply but its status.

const CALL_ABORT_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFRESH_BEFORE_MS = 60_000;

export interface ClaimedJob {
  id: string;
  prompt: string;
  history: ReplyMessage[];
  // Checked when it runs, by `mascotFromSnapshot`.
  mascot: unknown;
  actionApproval: ActionApproval;
  contextId: string | null;
}

export interface JobUpdate {
  status?: Exclude<CloudJobStatus, "queued">;
  steps?: ChatStep[];
  reply?: string;
  error?: string;
  // An empty string clears it.
  liveView?: string;
}

export interface Decision {
  decision: "allow" | "deny" | null;
  answer: string | null;
}

export interface RunnerDb {
  claim(): Promise<ClaimedJob | null>;
  // Also the heartbeat. True means stop: the user asked, or the job is gone or over.
  update(jobId: string, update: JobUpdate): Promise<boolean>;
  ask(jobId: string, ask: ApprovalToAsk): Promise<string>;
  decision(approvalId: string): Promise<Decision>;
}

// Where a relay job runs: the user's Mac if it's there, only there, or only in the cloud.
export type RelayWhere = "auto" | "mac" | "cloud";

// What the relay may ask the database, as the runner, with a grant's secret.
export interface RelayDb {
  relayMascots(secret: string): Promise<Record<string, unknown>[]>;
  // Null when it was for the Mac and the Mac isn't there.
  relayStartJob(secret: string, prompt: string, mascot: object, where: RelayWhere): Promise<string | null>;
  // The grant's own jobs by id, or its newest with none.
  relayJobs(secret: string, ids: string[] | null): Promise<Record<string, unknown>[]>;
  relayStopJob(secret: string, jobId: string): Promise<void>;
  // Takes up a grant made at sign-in, once its code is exchanged.
  relayActivate(secret: string): Promise<void>;
  relayRevoke(secret: string): Promise<void>;
}

export class DbError extends Error {
  constructor(readonly status: number) {
    super(status === 0 ? "Couldn't reach Supabase." : `Supabase answered ${status}.`);
  }
}

export interface DbConfig {
  url: string;
  key: string;
  email: string;
  password: string;
  // The account whose jobs it runs, which has to have linked this runner in Blueberry.
  owner: string;
}

// Says what's wrong in words for the deploy log, or gives the config. Values are never in the words.
export const dbConfig = (env: Record<string, string | undefined>): DbConfig | string => {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  const email = env.BLUEBERRY_RUNNER_EMAIL?.trim();
  const password = env.BLUEBERRY_RUNNER_PASSWORD;
  const owner = env.BLUEBERRY_RUNNER_OWNER?.trim();
  if (!url || !key || !email || !password || !owner) {
    return "Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BLUEBERRY_RUNNER_EMAIL, BLUEBERRY_RUNNER_PASSWORD and BLUEBERRY_RUNNER_OWNER.";
  }
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:" && !(protocol === "http:" && hostname === "127.0.0.1")) return "SUPABASE_URL has to be https.";
  } catch {
    return "SUPABASE_URL isn't an address.";
  }
  if (!key.startsWith("sb_publishable_")) return "SUPABASE_PUBLISHABLE_KEY has to be the publishable key, never a secret one.";
  if (email.toLowerCase() === owner.toLowerCase()) return "BLUEBERRY_RUNNER_EMAIL has to be an account of its own, not the owner's.";
  return { url, key, email, password, owner };
};

// The runner's own sign-in, as an ordinary user, kept in memory and refreshed as the app's is. If a refresh is refused
// it signs in again. Nothing of it is logged.
export const runnerSession = ({ url, key, email, password }: DbConfig, server = new GalleryServer({ url, key })) => {
  let session: ServerSession | null = null;
  let pending: Promise<string> | null = null;
  const fresh = async (): Promise<string> => {
    const refreshed = session && (await server.refresh(session.refreshToken, email).catch(() => null));
    session = refreshed ?? (await server.signIn(email, password).catch(() => null));
    if (!session) throw new DbError(401);
    return session.accessToken;
  };
  return {
    token: (): Promise<string> => {
      if (session && session.expiresAt - Date.now() > REFRESH_BEFORE_MS) return Promise.resolve(session.accessToken);
      // A refresh token works once, so callers at the same time share one.
      pending ??= fresh().finally(() => {
        pending = null;
      });
      return pending;
    },
    // The server refused the token, so the next call gets a new one.
    reset: () => {
      if (session) session = { ...session, expiresAt: 0 };
    },
  };
};

export type RunnerSession = ReturnType<typeof runnerSession>;

export const supabaseDb = (
  { url, key, owner }: DbConfig,
  auth: RunnerSession,
  send: typeof fetch = fetch,
): RunnerDb &
  PushDb &
  RoutineDb &
  RelayDb & {
    accept(): Promise<boolean>;
    setRelayUrl(url: string | null): Promise<void>;
    liveJobs(jobs: string[]): Promise<Set<string>>;
  } => {
  const call = async (name: string, body: object): Promise<{ status: number; text: string }> => {
    const authorization = `Bearer ${await auth.token()}`;
    try {
      const response = await send(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: key, authorization, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CALL_ABORT_MS),
      });
      return { status: response.status, text: await response.text() };
    } catch {
      throw new DbError(0);
    }
  };
  // What the function answered, to be checked here: a caller never names its type.
  const rpc = async (name: string, body: object): Promise<unknown> => {
    let { status, text } = await call(name, body);
    // An expired session: once more, with a new one.
    if (status === 401) {
      auth.reset();
      ({ status, text } = await call(name, body));
    }
    if (status < 200 || status >= 300) throw new DbError(status);
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new DbError(500);
    }
  };
  // A function that returns a table or a set answers with rows, each as its fields. Anything else fails as a call does,
  // so it never reads as there being none.
  const rows = async (name: string, body: object): Promise<Record<string, unknown>[]> => {
    const answer = await rpc(name, body);
    if (!Array.isArray(answer)) throw new DbError(500);
    return answer.map(fieldsOf);
  };

  return {
    // Which of these jobs a runner may still be working on, by the server's clock. One it can't ask about counts as live.
    liveJobs: async (jobs) => {
      const asked = jobs.filter((id) => UUID.test(id));
      const live = asked.length ? ((await rpc<unknown[]>("runner_live_jobs", { p_jobs: asked })) ?? []) : [];
      return new Set([...jobs.filter((id) => !UUID.test(id)), ...live.filter((id): id is string => typeof id === "string")]);
    },
    // Takes up the link the owner made in Blueberry. False until they have.
    accept: async () => (await rpc("accept_cloud_runner_link", { p_owner_email: owner })) === true,
    // Where ChatGPT and Claude connect, for the owner to see in Settings. Null when the relay is off.
    setRelayUrl: async (relayUrl) => {
      await rpc("runner_set_relay_url", { p_url: relayUrl });
    },
    // The relay's calls, as this runner, each with a grant's secret. None of them can decide anything.
    relayMascots: async (secret) => rows("relay_mascots", { p_secret: secret }),
    relayStartJob: async (secret, prompt, mascot, where) => {
      const id = await rpc("relay_start_job", { p_secret: secret, p_prompt: prompt, p_mascot: mascot, p_where: where });
      if (id === null && where === "mac") return null;
      if (typeof id !== "string") throw new DbError(500);
      return id;
    },
    relayJobs: async (secret, ids) => rows("relay_jobs", { p_secret: secret, p_ids: ids }),
    relayStopJob: async (secret, jobId) => {
      await rpc("relay_stop_job", { p_secret: secret, p_job: jobId });
    },
    relayActivate: async (secret) => {
      if ((await rpc("relay_activate_grant", { p_secret: secret })) !== true) throw new DbError(500);
    },
    relayRevoke: async (secret) => {
      await rpc("relay_revoke_grant", { p_secret: secret });
    },
    claim: async () => {
      const [row] = await rows("runner_claim_job", {});
      if (!row || typeof row.id !== "string" || typeof row.prompt !== "string") return null;
      return {
        id: row.id,
        prompt: row.prompt,
        history: historyFromRow(row.history),
        mascot: row.mascot,
        actionApproval: actionApprovalFromRow(row.action_approval),
        contextId: typeof row.context_id === "string" ? row.context_id : null,
      };
    },
    // Cut to the row's limits, so a long reply or many steps can't stop how it ended being saved.
    update: async (jobId, update) => {
      const { status, steps, reply, error, liveView } = fitJobUpdate(update);
      return (
        (await rpc("runner_update_job", {
          p_job: jobId,
          p_status: status ?? null,
          p_steps: steps ?? null,
          p_reply: reply ?? null,
          p_error: error ?? null,
          p_live_view: liveView ?? null,
        })) !== false
      );
    },
    ask: async (jobId, { kind, text, need, site }) => {
      const id = await rpc("runner_ask", { p_job: jobId, p_kind: kind, p_text: text, p_need: need, p_site: site });
      if (typeof id !== "string") throw new DbError(500);
      return id;
    },
    // Where the owner wants a notification. Only the address and its keys, to send one with no content.
    pushSubscriptions: async () =>
      (await rows("runner_push_subscriptions", {})).flatMap((row): PushSubscriptionRow[] =>
        typeof row.endpoint === "string" && typeof row.p256dh === "string" && typeof row.auth === "string"
          ? [{ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }]
          : [],
      ),
    forgetPushSubscription: async (endpoint) => {
      await rpc("runner_forget_push_subscription", { p_endpoint: endpoint });
    },
    dueRoutines: async () =>
      (await rows("runner_due_routines", {})).flatMap((row): DueRoutine[] =>
        typeof row.id === "string" && typeof row.time_zone === "string" && typeof row.next_run_at === "string"
          ? [{ id: row.id, schedule: row.schedule, timeZone: row.time_zone, dueAt: row.next_run_at }]
          : [],
      ),
    startRoutine: async (routineId, dueAt, next) => {
      const id = await rpc("runner_start_routine", { p_routine: routineId, p_due: dueAt, p_next: next });
      return typeof id === "string" ? id : null;
    },
    decision: async (approvalId) => {
      const [row] = await rows("runner_decision", { p_approval: approvalId });
      const decision = row?.decision === "allow" || row?.decision === "deny" ? row.decision : null;
      return { decision, answer: typeof row?.answer === "string" ? row.answer : null };
    },
  };
};
