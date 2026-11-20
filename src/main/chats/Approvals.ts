import { randomUUID } from "crypto";
import type { ChatApproval } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import { whyOnCard, type AskWhy } from "../../shared/asking";
import type { ChatParts, Run, WaitingRun } from "./chatTypes";
import type { Job } from "./Jobs";

const MAX_ANSWER_LENGTH = 2000;

export const publicApproval = ({ id, text, question, answers, why, handoff }: ChatApproval): ChatApproval => ({
  id,
  text,
  ...(question ? { question } : {}),
  ...(answers?.length ? { answers } : {}),
  ...(why ? { why } : {}),
  ...(handoff ? { handoff } : {}),
});

// What a run waits on the user for, an approval, a question or a handoff, and the one way each gets its answer.
export class Approvals {
  private readonly runs: ChatParts["runs"];
  private readonly store: ChatParts["store"];
  private readonly browser: ChatParts["browser"];
  private readonly events: ChatParts["events"];
  private readonly cloud: ChatParts["cloud"];
  private readonly runner: ChatParts["runner"];
  private readonly publish: ChatParts["publish"];
  private readonly jobs: ReadonlyMap<string, Job>;

  constructor(
    parts: Pick<ChatParts, "runs" | "store" | "browser" | "events" | "cloud" | "runner" | "publish"> & {
      jobs: ReadonlyMap<string, Job>;
    },
  ) {
    this.runs = parts.runs;
    this.store = parts.store;
    this.browser = parts.browser;
    this.events = parts.events;
    this.cloud = parts.cloud;
    this.runner = parts.runner;
    this.publish = parts.publish;
    this.jobs = parts.jobs;
  }

  // Everything waiting on the user, oldest first.
  waiting(): WaitingRun[] {
    return [...this.runs.entries()]
      .flatMap(([id, run]) => {
        if (!run.approval) return [];
        const job = this.jobs.get(id);
        const tabId = run.approval.handoff?.tabId ?? job?.current ?? null;
        return [
          {
            id,
            approval: publicApproval(run.approval),
            mascotId: run.mascot.id,
            chatTitle: this.store.chat(id)?.title ?? null,
            from: this.store.chat(id)?.from ?? null,
            // Not the step it is on, which is the asking.
            lastStep: run.steps.filter((step) => step.done).at(-1)?.text ?? null,
            tabId: tabId && (this.browser.allTabs().some((tab) => tab.id === tabId) || this.cloud?.page(tabId)) ? tabId : null,
            askedAt: run.approval.askedAt,
          },
        ];
      })
      .concat(this.runnerWaiting())
      .sort((a, b) => a.askedAt - b.askedAt);
  }

  // The runner's approvals, under their chat's id. The page they're about is in the cloud, so there's no tab to go to.
  private runnerWaiting(): WaitingRun[] {
    const runner = this.runner;
    if (!runner) return [];
    return runner.active().flatMap((chatId) => {
      const progress = runner.progress(chatId);
      const chat = this.store.chat(chatId);
      if (!progress?.approval || !chat) return [];
      return [
        {
          id: chatId,
          approval: publicApproval(progress.approval),
          mascotId: chat.mascotId ?? BERRY.id,
          chatTitle: chat.title,
          from: null,
          lastStep: progress.steps.filter((step) => step.done).at(-1)?.text ?? null,
          tabId: null,
          askedAt: progress.approval.askedAt,
        },
      ];
    });
  }

  wait<T>(
    chatId: string,
    run: Run,
    text: string,
    kind: Pick<ChatApproval, "question" | "answers" | "why" | "handoff">,
    onAnswer: (allow: boolean, answer?: string) => T,
  ): Promise<T> {
    const { signal } = run.controller;
    return new Promise((resolve, reject) => {
      const stopped = () => reject(new Error("Stopped while waiting for approval"));
      if (signal.aborted) return stopped();
      const tab = this.browser.allTabs().find(({ id }) => id === this.jobs.get(chatId)?.current);
      signal.addEventListener("abort", stopped, { once: true });
      run.approval = {
        id: randomUUID(),
        text,
        ...kind,
        askedAt: Date.now(),
        answer: (allow, answer) => {
          signal.removeEventListener("abort", stopped);
          tab?.actor?.answered();
          resolve(onAnswer(allow, answer));
        },
      };
      tab?.actor?.waitingForUser();
      this.publish(chatId, run);
      this.events.onListChanged();
    });
  }

  // The card names why it asked only by a known reason, and marks only what's in its words.
  askToAllow(chatId: string, run: Run, text: string, because?: AskWhy): Promise<boolean> {
    const why = whyOnCard(text, because);
    return this.wait(chatId, run, text, why ? { why } : {}, (allow) => allow);
  }

  // Null if the user would rather not answer. A pressed answer comes back through `decide` like a typed one.
  askQuestion(chatId: string, run: Run, question: string, answers: string[] = []): Promise<string | null> {
    return this.wait(chatId, run, question, { question: true, ...(answers.length > 0 ? { answers } : {}) }, (allow, answer) => {
      if (!allow || !answer) return null;
      if (!run.answeredElsewhere) run.answers.push({ question, answer });
      return answer;
    });
  }

  // False if that request has already been answered or its reply has ended. `answer` is for a question.
  decide(
    chatId: string,
    approvalId: string,
    allow: boolean,
    answer?: string,
    { fromPhone = false, fromApp = false }: { fromPhone?: boolean; fromApp?: boolean } = {},
  ): boolean {
    const run = this.runs.get(chatId);
    // On the runner, only the user answers, from this window. The phone and apps can't.
    if (!run && this.runner?.has(chatId))
      return (
        !fromPhone &&
        !fromApp &&
        this.runner.decide(
          chatId,
          approvalId,
          allow === true,
          typeof answer === "string" ? answer.trim().slice(0, MAX_ANSWER_LENGTH) : undefined,
        )
      );
    if (run?.approval?.id !== approvalId) return false;
    run.answeredElsewhere = fromPhone || fromApp;
    const { answer: finish } = run.approval;
    run.approval = null;
    this.events.onDecided?.(approvalId, allow === true);
    finish(allow === true, typeof answer === "string" ? answer.trim().slice(0, MAX_ANSWER_LENGTH) : undefined);
    this.publish(chatId, run);
    this.events.onListChanged();
    return true;
  }
}
