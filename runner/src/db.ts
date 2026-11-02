import type { ReplyMessage } from "../../src/main/agent";
import { actionApprovalFromRow, historyFromRow, type ApprovalToAsk, type CloudJobStatus } from "../../src/main/cloudJobs";
import type { ActionApproval } from "../../src/shared/ipc";
import type { ChatStep } from "../../src/shared/library";

// The runner's only way to Supabase: the `runner_*` functions, as the role `blueberry_runner` for one user. Nothing here
// can decide an approval, and the database refuses it too. No error passes on anything from a reply but its status.

const CALL_ABORT_MS = 15_000;

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

export class DbError extends Error {
  constructor(readonly status: number) {
    super(status === 0 ? "Couldn't reach Supabase." : `Supabase answered ${status}.`);
  }
}

export interface DbConfig {
  url: string;
  key: string;
  token: string;
}

// The token's own claims, read without checking the signature, which is the server's job. It's only to refuse the wrong
// kind of key before anything is sent: a service key, a user's session or anything else that isn't the runner's role.
const claimsOf = (token: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

// Says what's wrong in words for the deploy log, or gives the config. Values are never in the words.
export const dbConfig = (env: Record<string, string | undefined>): DbConfig | string => {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  const token = env.BLUEBERRY_RUNNER_TOKEN;
  if (!url || !key || !token) return "Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and BLUEBERRY_RUNNER_TOKEN.";
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:" && !(protocol === "http:" && hostname === "127.0.0.1")) return "SUPABASE_URL has to be https.";
  } catch {
    return "SUPABASE_URL isn't an address.";
  }
  if (!key.startsWith("sb_publishable_")) return "SUPABASE_PUBLISHABLE_KEY has to be the publishable key, never a secret one.";
  const claims = claimsOf(token);
  if (claims?.role !== "blueberry_runner") return "BLUEBERRY_RUNNER_TOKEN has to be a token for the blueberry_runner role. See runner/README.md.";
  if (typeof claims.sub !== "string") return "BLUEBERRY_RUNNER_TOKEN has to name the user it works for.";
  return { url, key, token };
};

export const supabaseDb = ({ url, key, token }: DbConfig, send: typeof fetch = fetch): RunnerDb => {
  const rpc = async <T>(name: string, body: object): Promise<T> => {
    let response: Response;
    let text: string;
    try {
      response = await send(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: key, authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CALL_ABORT_MS),
      });
      text = await response.text();
    } catch {
      throw new DbError(0);
    }
    if (!response.ok) throw new DbError(response.status);
    return (text ? JSON.parse(text) : null) as T;
  };

  return {
    claim: async () => {
      const rows = await rpc<Record<string, unknown>[]>("runner_claim_job", {});
      const row = rows?.[0];
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
    update: async (jobId, { status, steps, reply, error, liveView }) =>
      (await rpc<boolean>("runner_update_job", {
        p_job: jobId,
        p_status: status ?? null,
        p_steps: steps ?? null,
        p_reply: reply ?? null,
        p_error: error ?? null,
        p_live_view: liveView ?? null,
      })) !== false,
    ask: async (jobId, { kind, text, need, site }) => {
      const id = await rpc<unknown>("runner_ask", { p_job: jobId, p_kind: kind, p_text: text, p_need: need, p_site: site });
      if (typeof id !== "string") throw new DbError(500);
      return id;
    },
    decision: async (approvalId) => {
      const [row] = (await rpc<Record<string, unknown>[]>("runner_decision", { p_approval: approvalId })) ?? [];
      const decision = row?.decision === "allow" || row?.decision === "deny" ? row.decision : null;
      return { decision, answer: typeof row?.answer === "string" ? row.answer : null };
    },
  };
};
