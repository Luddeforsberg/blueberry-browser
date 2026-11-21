import { FINISHED, stepsFromRow, type CloudJobStatus } from "./cloudJobs";
import { endError, fresh, newJobs, type Entry, type NewJob, type RunnerParts } from "./runnerTypes";
import { fieldsOf } from "../../shared/fields";

// Conversations on the account that this computer didn't send, or that went on elsewhere, such as from the phone: each
// comes here as a runner chat, or joins the chat it follows.
export class RunnerDiscovery {
  private discovering = false;

  private readonly server: RunnerParts["server"];
  private readonly hooks: RunnerParts["hooks"];
  private readonly entries: RunnerParts["entries"];
  private readonly forgotten: RunnerParts["forgotten"];
  private readonly parts: Pick<RunnerParts, "signedIn" | "available" | "withToken" | "save" | "schedule">;

  constructor(
    parts: Pick<RunnerParts, "server" | "hooks" | "entries" | "forgotten" | "signedIn" | "available" | "withToken" | "save" | "schedule">,
  ) {
    this.server = parts.server;
    this.hooks = parts.hooks;
    this.entries = parts.entries;
    this.forgotten = parts.forgotten;
    this.parts = parts;
  }

  private get signedIn(): string | null {
    return this.parts.signedIn();
  }

  private available(): boolean {
    return this.parts.available();
  }

  private withToken<T>(account: string, call: (token: string) => Promise<T>): Promise<T | null> {
    return this.parts.withToken(account, call);
  }

  private save(): void {
    this.parts.save();
  }

  private schedule(): void {
    this.parts.schedule();
  }

  // Looks for conversations on the account that this computer didn't send, or that went on elsewhere: a job from the phone
  // becomes a runner chat here, and a follow-up from there joins the chat it follows. Only while a linked runner has
  // accepted, as the signed-in account, and never for a chat with a job going or being sent from here.
  async discover(): Promise<void> {
    const account = this.signedIn;
    if (this.discovering || !account || !this.available()) return;
    this.discovering = true;
    try {
      const listed = await this.withToken(account, (token) => this.server!.cloudConversationJobs(token));
      if (!listed) return;
      const conversations = new Map<string, string[]>();
      listed.forEach(({ id, conversation_id: conversationId }) =>
        conversations.set(conversationId, [...(conversations.get(conversationId) ?? []), id]),
      );
      for (const [conversationId, jobIds] of conversations) {
        if (this.signedIn !== account) return;
        const known = this.chatOf(account, conversationId)?.[1];
        if (this.forgotten.includes(conversationId) || known?.active || (known && jobIds.every((id) => known.jobIds.includes(id))))
          continue;
        const rows = await this.withToken(account, (token) => this.server!.cloudConversation(token, conversationId));
        if (rows && this.signedIn === account) this.take(account, conversationId, rows);
      }
    } finally {
      this.discovering = false;
    }
  }

  private chatOf(account: string, conversationId: string): [string, Entry] | undefined {
    return [...this.entries].find(([, entry]) => entry.account === account && entry.conversationId === conversationId);
  }

  // A conversation's jobs, oldest first, as the server has them now. What's new to this computer is saved as the chat
  // would have saved it, and a job still going is followed like one sent from here.
  private take(account: string, conversationId: string, rows: Record<string, unknown>[]): void {
    let found = this.chatOf(account, conversationId);
    // Checked again, since a message may have been sent from here while it asked.
    if (this.forgotten.includes(conversationId) || found?.[1].active) return;
    const fresher = newJobs(rows, found?.[1].jobIds ?? []);
    const [oldest] = fresher;
    if (!oldest) return;
    if (!found) {
      const mascotId = fieldsOf(oldest.mascot).id;
      const chatId = this.hooks.adopt?.({ prompt: oldest.prompt, mascotId: typeof mascotId === "string" ? mascotId : null });
      if (!chatId) return;
      found = [chatId, fresh({ account, conversationId, jobIds: [], jobId: null, active: false })];
      this.entries.set(...found);
    }
    this.apply(...found, fresher);
  }

  // While a message from here is being sent: brings in what was sent in the chat's conversation elsewhere since its newest
  // job here. False if a job there is still going, so this one can't go yet, or it couldn't be read.
  async catchUp(account: string, chatId: string, entry: Entry): Promise<boolean> {
    const rows = await this.withToken(account, (token) => this.server!.cloudConversation(token, entry.conversationId));
    if (!rows || this.signedIn !== account || this.entries.get(chatId) !== entry) return false;
    const fresher = newJobs(rows, entry.jobIds);
    if (fresher.length === 0 || fresher.some((row) => !FINISHED.includes(row.status as CloudJobStatus))) return false;
    this.apply(chatId, entry, fresher);
    return true;
  }

  // Saves jobs new to this chat in order: each one's message, then how it ended, or follows the one still going.
  private apply(chatId: string, entry: Entry, fresher: NewJob[]): void {
    for (const row of fresher) {
      entry.jobIds.push(row.id);
      this.hooks.followedUp?.(chatId, row.prompt);
      const status = (typeof row.status === "string" ? row.status : "failed") as CloudJobStatus;
      if (FINISHED.includes(status)) {
        this.hooks.finished(chatId, {
          reply: typeof row.reply === "string" ? row.reply : "",
          steps: stepsFromRow(row.steps),
          error: endError(status, typeof row.error === "string" ? row.error : null),
        });
        continue;
      }
      // Only one in a conversation goes at a time, and it's the newest.
      Object.assign(entry, { jobId: row.id, active: true, status, steps: [], reply: "", error: null, liveView: null, approval: null });
      this.hooks.changed(chatId);
      break;
    }
    this.save();
    this.schedule();
  }
}
