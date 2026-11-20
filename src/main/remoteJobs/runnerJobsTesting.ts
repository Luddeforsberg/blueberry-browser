import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountState } from "../../shared/ipc";
import { BERRY } from "../../shared/mascots";
import { ServerError, type GalleryServer } from "../account/galleryServer";
import { vi } from "vitest";
import { RunnerJobs } from "./RunnerJobs";

// What the tests of RunnerJobs share: a server as each account sees it, and accounts to sign in as.

export const LIVE = "https://www.browserbase.com/devtools-fullscreen/inspector.html";
export const ANA = "ana@example.com";
export const BO = "bo@example.com";

// The server as each account sees it: its own jobs only, as row-level security has it.
export const setUp = () => {
  // While set, every token waits for it, as a refresh does.
  let refreshing: Promise<void> | null = null;
  // While set, the server's answer to a new job waits for it.
  let answering: Promise<void> | null = null;
  // Whether the runner is still linked, as the server would say.
  const link = { accepted: true };
  const jobs = new Map<string, { owner: string; row: Record<string, unknown> }>();
  let made = 0;
  const account = { state: { status: "signed-in", email: ANA, problem: null } as AccountState };
  const tokenOf = () => account.state.email ?? "";
  const server = {
    startCloudJob: vi.fn(
      async (token: string, job: { prompt: string; history: unknown[]; conversationId: string; afterJobId: string | null }) => {
        await answering;
        if (!link.accepted) throw new ServerError(400, "");
        const conversation = [...jobs.values()].filter(({ row }) => row.conversation_id === job.conversationId).map(({ row }) => row);
        if (conversation.some((row) => !["done", "failed", "stopped"].includes(String(row.status)))) throw new ServerError(409, "");
        // Refused unless it was built on the conversation's newest job, as the server does.
        if ((conversation.at(-1)?.id ?? null) !== job.afterJobId) throw new ServerError(409, "");
        const id = `job-${++made}`;
        jobs.set(id, {
          owner: token,
          row: {
            id,
            conversation_id: job.conversationId,
            prompt: job.prompt,
            mascot: { id: "berry" },
            created_at: `2026-11-02T10:00:${String(made).padStart(2, "0")}Z`,
            status: "waiting",
            steps: [{ text: "Opened shop.example", done: true }],
            reply: "",
            live_view_url: LIVE,
            approval_id: `${id}-a`,
            approval_kind: "approval",
            approval_text: "Click Place order",
          },
        });
        return id;
      },
    ),
    cloudConversationJobs: async (token: string) =>
      [...jobs.values()]
        .filter(({ owner }) => owner === token)
        .map(({ row }) => row)
        .reverse(),
    cloudConversation: async (token: string, id: string) =>
      [...jobs.values()].filter(({ owner, row }) => owner === token && row.conversation_id === id).map(({ row }) => row),
    forgetCloudConversation: vi.fn(async (token: string, id: string) => {
      jobs.forEach(({ owner, row }, key) => owner === token && row.conversation_id === id && jobs.delete(key));
    }),
    cloudJobs: async (token: string, ids: string[]) => ids.flatMap((id) => (jobs.get(id)?.owner === token ? [jobs.get(id)!.row] : [])),
    decideCloudApproval: vi.fn(async () => true),
    myCloudRunner: async () => (link.accepted ? { email: "runner@example.com", accepted: true, relayUrl: null } : null),
    stopCloudJob: vi.fn(async () => {}),
  } as unknown as GalleryServer;
  const changed = vi.fn();
  const finished = vi.fn();
  // The chats this computer has, as `Chats` keeps them, with the messages from elsewhere.
  const chats = new Map<string, { mascotId: string | null; said: string[] }>();
  const adopt = vi.fn(({ prompt, mascotId }: { prompt: string; mascotId: string | null }) => {
    const id = `adopted-${chats.size + 1}`;
    chats.set(id, { mascotId, said: [] });
    void prompt;
    return id;
  });
  const followedUp = vi.fn((chatId: string, prompt: string) => chats.get(chatId)?.said.push(prompt));
  // The Mac's own chat, as `Chats` keeps it: what's saved there, which a message sent from here builds its history on.
  const transcript: { role: "user" | "assistant"; content: string }[] = [];
  const runner = new RunnerJobs(
    server,
    {
      get state() {
        return account.state;
      },
      accessToken: async () => {
        await refreshing;
        return account.state.status === "signed-in" ? tokenOf() : null;
      },
    },
    join(mkdtempSync(join(tmpdir(), "runner-jobs-")), "runner-jobs.json"),
    {
      changed,
      finished: (chatId: string, result: { reply: string; steps: unknown[]; error: string | null }) => {
        finished(chatId, result);
        if (chatId === "chat-1" && result.reply) transcript.push({ role: "assistant", content: result.reply });
      },
      contextId: () => null,
      adopt,
      followedUp: (chatId: string, prompt: string) => {
        followedUp(chatId, prompt);
        if (chatId === "chat-1") transcript.push({ role: "user", content: prompt });
      },
    },
    5,
  );
  const signIn = (email: string | null) => {
    account.state = email
      ? { status: "signed-in", email, problem: null, problemAbout: null }
      : { status: "signed-out", email: null, problem: null, problemAbout: null };
    runner.accountChanged();
  };
  // As `Chats` sends: the history read from the chat when it goes, and the message saved once the runner has it.
  const send = async (chatId = "chat-1", prompt = "Order it") => {
    const problem = await runner.start(chatId, {
      prompt,
      earlier: () => (chatId === "chat-1" ? [...transcript] : []),
      mascot: BERRY,
      actionApproval: "risky",
    });
    if (chatId === "chat-1") transcript.push({ role: "user", content: prompt });
    return problem;
  };
  // A job sent from the phone, as Ana, in a conversation of its own or one it follows up.
  const fromPhone = (prompt: string, conversationId = `phone-${made + 1}`, status = "running") => {
    const id = `job-${++made}`;
    jobs.set(id, {
      owner: ANA,
      row: {
        id,
        conversation_id: conversationId,
        prompt,
        mascot: { id: "m-scout" },
        created_at: `2026-11-02T10:00:${String(made).padStart(2, "0")}Z`,
        status,
        steps: [],
        reply: status === "done" ? "Done there" : "",
      },
    });
    return id;
  };
  const hold = (set: (gate: Promise<void> | null) => void) => {
    let release = () => {};
    set(new Promise((resolve) => (release = resolve)));
    return () => {
      set(null);
      release();
    };
  };
  const holdTokens = () =>
    hold((gate) => {
      refreshing = gate;
    });
  const holdAnswers = () =>
    hold((gate) => {
      answering = gate;
    });
  return {
    runner,
    jobs,
    signIn,
    send,
    changed,
    finished,
    server,
    holdTokens,
    holdAnswers,
    link,
    fromPhone,
    adopt,
    followedUp,
    chats,
    transcript,
  };
};

export const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
