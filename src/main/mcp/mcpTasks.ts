import type { ChatThread, MascotProfile } from "../../shared/library";
import type { WaitingRun } from "../chats/Chats";
import { BERRY } from "../../shared/mascots";
import { APPROVAL_NOTE, at, clip, failed, HANDOFF_NOTE, json, type McpToolResult } from "./mcpResults";
import type { McpHost } from "./mcpTools";

// The tasks an app started, as it sees them: a chat started with `Chats.send`, or a routine run, each with its status in
// words an app can act on. The routine runs started from here are only known here.

export const MAX_TASK_LENGTH = 4000;

type TaskStatus =
  | "working"
  | "has_question"
  | "waiting_for_approval"
  | "waiting_for_user"
  | "queued"
  | "done"
  | "failed"
  | "stopped"
  | "interrupted"
  | "ended";

// What's waiting, in words an app can act on. An approval says only that it's the user's to answer.
const waitingFor = (waiting: WaitingRun | undefined, clean: (text: string) => string) => {
  if (!waiting) return null;
  const { approval } = waiting;
  if (approval.question)
    return {
      kind: "question",
      question: clean(approval.text),
      howToAnswer: "Call respond_to_task with the answer, or the user can answer it in Blueberry.",
    };
  if (approval.handoff) return { kind: "user_in_tab", needs: clean(approval.text), note: HANDOFF_NOTE };
  return { kind: "approval", wouldLike: clean(approval.text), note: APPROVAL_NOTE };
};

const statusOf = (waiting: WaitingRun | undefined, running: boolean, ended: TaskStatus): TaskStatus => {
  if (waiting?.approval.question) return "has_question";
  if (waiting?.approval.handoff) return "waiting_for_user";
  if (waiting) return "waiting_for_approval";
  return running ? "working" : ended;
};

export const createTasks = (host: McpHost) => {
  // Routine runs started from here, by the task id handed out, with the run each became once it started. Only these can
  // be reached: a routine's own id names runs the user or the schedule started. Memory only, newest last.
  const routineTasks = new Map<string, { routineId: string; runId: string | null; cancelled: boolean }>();

  const liveMascots = () => host.mascots().filter((mascot) => mascot.deletedAt === null);
  const findAgent = (name: string) => {
    const wanted = name.trim().toLowerCase();
    return liveMascots().find((mascot) => mascot.id === name.trim() || mascot.name.toLowerCase() === wanted) ?? null;
  };
  const nameOf = (mascotId: string | null) =>
    host.mascots().find((mascot) => mascot.id === (mascotId ?? BERRY.id))?.name ?? "A mascot that was deleted";

  const routineRun = (routineId: string, runId: string | null) =>
    runId === null ? null : (host.routineRuns(routineId).find(({ id }) => id === runId) ?? null);

  const chatTask = (chat: ChatThread) => {
    const waiting = host.waiting().find(({ id }) => id === chat.id);
    const running = host.isRunning(chat.id);
    const last = chat.messages.at(-1);
    const reply = running ? chat.partial : last?.role === "assistant" ? last.content : null;
    const steps = running ? chat.steps : last?.role === "assistant" ? (last.steps ?? []) : [];
    const outcome = host.outcome(chat.id);
    const ended: TaskStatus =
      outcome === "done"
        ? "done"
        : outcome === "stopped"
          ? "stopped"
          : outcome === "failed" || chat.error
            ? "failed"
            : last?.role === "assistant"
              ? "done"
              : "ended";
    return {
      id: chat.id,
      kind: "chat",
      agent: nameOf(chat.mascotId),
      from: chat.from,
      status: statusOf(waiting, running, ended),
      task: chat.messages.find(({ role }) => role === "user")?.content ?? null,
      steps: steps.map(({ text }) => host.clean(text)),
      reply: reply ? host.clean(reply) : null,
      error: chat.error,
      waitingFor: waitingFor(waiting, host.clean),
    };
  };

  const routineTask = (taskId: string) => {
    const started = routineTasks.get(taskId);
    const routine = started && host.routines().find(({ id }) => id === started.routineId);
    if (!started || !routine) return null;
    const run = routineRun(started.routineId, started.runId);
    const waiting = run ? host.waiting().find(({ id }) => id === run.id) : undefined;
    const ended: TaskStatus = !run
      ? started.cancelled
        ? "stopped"
        : "queued"
      : run.status === "finished"
        ? "done"
        : run.status === "needs-approval" || run.status === "running"
          ? "working"
          : run.status;
    return {
      id: taskId,
      kind: "routine",
      routine: routine.name,
      agent: nameOf(routine.mascotId),
      status: statusOf(waiting, run?.status === "running", ended),
      startedAt: at(run?.startedAt ?? null),
      endedAt: at(run?.endedAt ?? null),
      steps: (run?.steps ?? []).map(({ text }) => host.clean(text)),
      reply: run?.result ? host.clean(run.result) : null,
      error: run?.error ?? null,
      waitingFor: waitingFor(waiting, host.clean),
    };
  };

  const task = (id: string) => {
    if (routineTasks.has(id)) return routineTask(id);
    const chat = host.chat(id);
    return chat?.from ? chatTask(chat) : null;
  };

  // The id `chat:decide` takes: the chat's, or the routine run's once it has started.
  const runIdOf = (taskId: string): string | null => {
    const started = routineTasks.get(taskId);
    if (!started) return host.chat(taskId)?.from ? taskId : null;
    return routineRun(started.routineId, started.runId)?.id ?? null;
  };

  const NO_TASK = (id: string) =>
    failed(`There's no task ${id} from an app. list_tasks names the ones there are.`, `No task ${clip(id, 40)}`);

  const startJob = (task: string, mascot: MascotProfile, sites: string[], client: string): McpToolResult => {
    const text = task.trim();
    if (!text) return failed("Say what the job is.", "Empty task");
    const chat = host.startChat(text.slice(0, MAX_TASK_LENGTH), {
      mascotId: mascot.id === BERRY.id ? null : mascot.id,
      sites,
      from: client,
    });
    if (!chat) return failed(`${mascot.name} couldn't start that job.`, `Couldn't start ${mascot.name}`);
    return {
      text: json({
        taskId: chat.id,
        agent: mascot.name,
        status: "working",
        note: "It runs in the user's Blueberry, in tabs of its own, and can take a few minutes. Check on it with get_task. It may stop to ask the user before acting.",
      }),
      summary: `${mascot.name}: ${clip(text)}`,
    };
  };

  return { routineTasks, liveMascots, findAgent, nameOf, chatTask, routineTask, task, runIdOf, NO_TASK, startJob };
};
