import type { ChatStep, ChatThread } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import type { StoredChat } from "./ChatStore";
import { publicApproval } from "./Approvals";
import { titleFrom, type ChatTitles } from "./chatTitles";
import type { ChatParts } from "./chatTypes";
import { toReplyMessage } from "./modelMessages";

// Chats whose jobs run on the cloud runner: what's sent there, and what comes back from it, saved here like any other chat.
export class RunnerChats {
  // A message on its way to the runner, shown last and saved once the runner has it, so anything sent in that chat
  // elsewhere meanwhile is saved before it.
  readonly runnerPending = new Map<string, string>();

  private readonly store: ChatParts["store"];
  private readonly browser: ChatParts["browser"];
  private readonly mascotOf: ChatParts["mascotOf"];
  private readonly runner: ChatParts["runner"];
  private readonly errors: ChatParts["errors"];
  private readonly finished: ChatParts["finished"];
  private readonly notify: ChatParts["notify"];
  private readonly thread: (id: string) => ChatThread | null;
  private readonly titles: ChatTitles;

  constructor(
    parts: Pick<ChatParts, "store" | "browser" | "mascotOf" | "runner" | "errors" | "finished" | "notify"> & {
      thread: (id: string) => ChatThread | null;
      titles: ChatTitles;
    },
  ) {
    this.store = parts.store;
    this.browser = parts.browser;
    this.mascotOf = parts.mascotOf;
    this.runner = parts.runner;
    this.errors = parts.errors;
    this.finished = parts.finished;
    this.notify = parts.notify;
    this.thread = parts.thread;
    this.titles = parts.titles;
  }

  // A runner chat as the screen shows it, with its reply, steps and approval from the runner's rows.
  threadOf(chat: StoredChat): ChatThread {
    const progress = this.runner?.progress(chat.id);
    const pending = this.runnerPending.get(chat.id);
    return {
      ...chat,
      messages: pending === undefined ? chat.messages : [...chat.messages, { role: "user", content: pending }],
      partial: progress?.reply ?? null,
      statusLine: null,
      steps: progress?.steps ?? [],
      said: [],
      startedAt: null,
      approval: progress?.approval ? publicApproval(progress.approval) : null,
      error: this.errors.get(chat.id) ?? null,
      memoryIds: [],
      runner: true,
    };
  }

  sendToRunner(chatId: string | null, message: string, mascotId: string | null): ChatThread | null {
    const runner = this.runner;
    if (!runner?.available()) return null;
    const chosen = typeof mascotId === "string" && mascotId !== BERRY.id ? mascotId : null;
    if (!chatId && chosen && this.mascotOf(chosen).deletedAt !== null) return null;
    const id = chatId ?? this.store.createChat(titleFrom(message), chosen, null);
    const mascot = this.mascotOf(this.store.chat(id)?.mascotId ?? null);
    const earlier = () => (this.store.chat(id)?.messages ?? []).map(toReplyMessage);
    this.runnerPending.set(id, message);
    this.errors.delete(id);
    this.finished.delete(id);
    void runner.start(id, { prompt: message, earlier, mascot, actionApproval: this.browser.actionApproval() }).then((problem) => {
      this.runnerPending.delete(id);
      if (!this.store.chat(id)) return;
      this.store.addMessage(id, { role: "user", content: message });
      // What was brought in first may have ended in an error of its own, which isn't this message's.
      if (problem) this.errors.set(id, problem);
      else this.errors.delete(id);
      this.notify(id);
    });
    this.notify(id);
    return this.thread(id);
  }

  // A conversation in the cloud that was started elsewhere, such as on the phone, becomes a runner chat here, as the mascot
  // its first job ran as. Its messages follow through `runnerFollowedUp` and `runnerFinished`.
  adoptRunnerChat(prompt: string, mascotId: string | null): string {
    return this.store.createChat(titleFrom(prompt), mascotId && mascotId !== BERRY.id ? mascotId : null, null);
  }

  // A message sent in a runner chat from elsewhere.
  runnerFollowedUp(chatId: string, prompt: string): void {
    if (!this.store.chat(chatId)) return;
    this.store.addMessage(chatId, { role: "user", content: prompt });
    this.errors.delete(chatId);
    this.finished.delete(chatId);
    this.notify(chatId);
  }

  // A job on the runner is over, and its reply is saved like any other.
  runnerFinished(chatId: string, { reply, steps, error }: { reply: string; steps: ChatStep[]; error: string | null }): void {
    if (!this.store.chat(chatId)) return;
    if (reply || steps.length > 0)
      this.store.addMessage(chatId, { role: "assistant", content: reply, steps: steps.map((step) => ({ ...step, done: true })) });
    if (error) this.errors.set(chatId, error);
    this.notify(chatId);
    if (reply && !error) void this.titles.nameChat(chatId);
  }
}
