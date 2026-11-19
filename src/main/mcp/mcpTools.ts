import { randomUUID } from "crypto";
import { z } from "zod";
import { plausibleCode } from "../phone/phoneReplies";
import type { WaitingRun } from "../chats/Chats";
import type { Bookmark, ChatThread, ChatThreadSummary, MascotProfile, MemoryFact, Routine, RoutineRun } from "../../shared/library";
import type { HistoryEntry, Visit } from "../../shared/ipc";
import { BERRY } from "../../shared/mascots";
import { agentSummary, sitesFromApp } from "./mcpMascots";
import { browsingTools } from "./mcpBrowsingTools";
import { APPROVAL_NOTE, at, clip, count, failed, fromWeb, HANDOFF_NOTE, json, type McpToolResult } from "./mcpResults";
import { createTasks, MAX_TASK_LENGTH } from "./mcpTasks";

export { UNTRUSTED_NOTE, type McpToolResult } from "./mcpResults";

// What Claude and other apps on this computer can ask of Blueberry, over MCP. Every job goes through `Chats.send` or a
// routine's run, exactly as the user's own would, so a mascot's limits and every approval apply unchanged. An app can
// answer a question, never an approval: only the user can allow something, in Blueberry or from their phone.

const MAX_ANSWER_LENGTH = 2000;
const MAX_LISTED_TASKS = 20;
const MAX_REMEMBERED_TASKS = 200;

export interface McpTab {
  id: string;
  title: string;
  url: string;
  active: boolean;
  // A job is working in it right now.
  working: boolean;
  // Handed to the user for a sign-in or a code. Only its site is given.
  heldForUser: boolean;
}

// Everything the tools need from the app. Each one is an existing path; nothing here reaches past it.
export interface McpHost {
  mascots: () => MascotProfile[];
  startChat: (task: string, options: { mascotId: string | null; sites: string[]; from: string }) => ChatThread | null;
  chat: (id: string) => ChatThread | null;
  // Chats started by an app, newest first.
  chatsFromApps: () => ChatThreadSummary[];
  isRunning: (chatId: string) => boolean;
  // How a chat's latest reply ended, while that's still known. Null while it runs or once it's forgotten.
  outcome: (chatId: string) => "done" | "stopped" | "failed" | null;
  stop: (chatId: string) => void;
  // Everything waiting on the user, chats and routine runs alike, by the id `chat:decide` takes.
  waiting: () => WaitingRun[];
  answer: (id: string, approvalId: string, answer: string) => boolean;
  routines: () => Routine[];
  // `onStart` hears the id of the run this becomes, so the task is that run and no other.
  runRoutine: (id: string, onStart: (runId: string) => void) => boolean;
  routineRuns: (routineId: string) => RoutineRun[];
  stopRoutineRun: (runId: string) => boolean;
  // A Run now that hasn't started yet. False if it has, or there's none.
  cancelRoutineRequest: (routineId: string) => boolean;
  tabs: () => McpTab[];
  readTab: (tabId: string, offset: number) => Promise<string>;
  searchHistory: (query: string, limit: number) => HistoryEntry[];
  recentHistory: (limit: number) => Visit[];
  bookmarks: () => { bookmarks: Bookmark[]; pinned: Bookmark[] };
  facts: () => MemoryFact[];
  // Takes out codes from the phone and address details from a sign-in, as for anything going to a model.
  clean: (text: string) => string;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  // A raw zod shape, as the SDK's `registerTool` takes it.
  shape: z.ZodRawShape;
  readOnly: boolean;
  run: (args: Record<string, unknown>, client: string) => Promise<McpToolResult>;
}

const FEATURES = [
  {
    name: "The mascots",
    what: "Mascots the user made, each with instructions and limits on where it may go and what it may do. list_agents names them, and run_agent gives one a job.",
  },
  {
    name: "Jobs in the user's browser",
    what: "run_agent and run_browser_task start a job that works in the user's own Blueberry, where they're signed in. It opens its own tabs behind whatever the user is doing, and shows as a chat in Blueberry marked as coming from you.",
  },
  {
    name: "Asking before acting",
    what: "By the user's setting, a job stops to ask before anything that could delete, send, buy or change text. Only the user can allow it, in Blueberry or from their phone. get_task says when one is waiting.",
  },
  {
    name: "Questions",
    what: "A job may ask something only the user knows. You can answer with respond_to_task, or the user can in Blueberry. Passwords and codes are never asked or answered this way.",
  },
  {
    name: "Needs you",
    what: "One page in Blueberry with everything waiting on the user, which they can also answer from their phone through Telegram.",
  },
  {
    name: "Hand to user",
    what: "For a sign-in, a code or a captcha, the job hands the tab to the user and waits. Nothing they type there reaches any model.",
  },
  {
    name: "The working view",
    what: "Beside a chat in Blueberry, a live picture of the tab the job is using, with the mascot drawn working in the page.",
  },
  { name: "Routines", what: "Saved jobs on a schedule or on demand. list_routines and run_routine." },
  {
    name: "Memory",
    what: "Things the user chose to let their mascots remember about how they like things done. get_user_profile reads it. Nothing here can change it.",
  },
  { name: "Browsing context", what: "Read-only: get_open_tabs, read_page, search_history, get_recent_activity and get_bookmarks." },
];

export const createMcpTools = (host: McpHost): McpTool[] => {
  const { routineTasks, liveMascots, findAgent, nameOf, chatTask, routineTask, task, runIdOf, NO_TASK, startJob } = createTasks(host);

  const tools: McpTool[] = [
    {
      name: "list_agents",
      title: "List the mascots",
      description:
        "The user's mascots (agents) in Blueberry: each one's name, what it's for, the sites it may use and what it may do, in words. Berry is always first and has no limits.",
      shape: {},
      readOnly: true,
      run: async () => {
        const agents = liveMascots().map(agentSummary);
        return { text: json(agents), summary: count(agents.length, "mascot") };
      },
    },
    {
      name: "list_features",
      title: "What Blueberry can do",
      description: "What Blueberry offers, so you know what to ask for.",
      shape: {},
      readOnly: true,
      run: async () => ({ text: json(FEATURES), summary: "Features" }),
    },
    {
      name: "run_agent",
      title: "Give a mascot a job",
      description:
        "Start a job for one of the user's mascots, by its name or id from list_agents. It works in the user's own browser, with their logins, within that mascot's limits, and asks the user before anything risky. Returns a task id at once: check on it with get_task.",
      shape: {
        agent: z.string().min(1).describe("The mascot's name or id."),
        task: z.string().min(1).max(MAX_TASK_LENGTH).describe("What to do, in plain words, as you'd ask a person."),
      },
      readOnly: false,
      run: async ({ agent, task }, client) => {
        const mascot = findAgent(String(agent));
        if (!mascot)
          return failed(`There's no mascot called ${String(agent)}. list_agents names them.`, `No mascot ${clip(String(agent), 30)}`);
        return startJob(String(task), mascot, [], client);
      },
    },
    {
      name: "run_browser_task",
      title: "Give Berry a job",
      description:
        "Start a job for Berry in the user's own browser, with their logins. Give `sites` to keep it to those sites. It asks the user before anything risky. Returns a task id at once: check on it with get_task.",
      shape: {
        goal: z.string().min(1).max(MAX_TASK_LENGTH).describe("What to do, in plain words."),
        sites: z.array(z.string()).max(20).optional().describe("Only these sites, such as example.com. Leave out for any site."),
      },
      readOnly: false,
      run: async ({ goal, sites }, client) => {
        const parsed = sitesFromApp(sites);
        if ("bad" in parsed) return failed(`“${parsed.bad}” doesn't look like a site. Try something like example.com.`, "Bad site");
        return startJob(String(goal), BERRY, parsed.sites, client);
      },
    },
    {
      name: "list_routines",
      title: "List routines",
      description: "The user's saved routines: jobs on a schedule or on demand, with their last result.",
      shape: {},
      readOnly: true,
      run: async () => {
        const routines = host.routines().map((routine) => ({
          id: routine.id,
          name: routine.name,
          agent: nameOf(routine.mascotId),
          instructions: routine.instructions,
          schedule: routine.schedule,
          sites: routine.sites.length > 0 ? routine.sites : "any",
          paused: routine.paused,
          status: routine.status,
          lastResult: host.clean(routine.lastResult),
        }));
        return { text: fromWeb(routines), summary: count(routines.length, "routine") };
      },
    },
    {
      name: "run_routine",
      title: "Run a routine now",
      description:
        "Run one of the user's routines now, by its id or name from list_routines. Returns a task id at once: check on it with get_task.",
      shape: { routine: z.string().min(1).describe("The routine's id or name.") },
      readOnly: false,
      run: async ({ routine: wanted }) => {
        const name = String(wanted).trim();
        const routine = host.routines().find(({ id, name: own }) => id === name || own.toLowerCase() === name.toLowerCase());
        if (!routine) return failed(`There's no routine called ${name}. list_routines names them.`, `No routine ${clip(name, 30)}`);
        const taskId = `routine:${randomUUID()}`;
        const started = { routineId: routine.id, runId: null as string | null, cancelled: false };
        if (!host.runRoutine(routine.id, (runId) => (started.runId = runId)))
          return failed(`${routine.name} is running already.`, `${routine.name} already running`);
        routineTasks.set(taskId, started);
        if (routineTasks.size > MAX_REMEMBERED_TASKS) routineTasks.delete(routineTasks.keys().next().value as string);
        return {
          text: json({
            taskId,
            routine: routine.name,
            status: "queued",
            note: "Check on it with get_task. It may wait for a free place first.",
          }),
          summary: `Ran ${routine.name}`,
        };
      },
    },
    {
      name: "get_task",
      title: "Check on a task",
      description:
        "How a task from run_agent, run_browser_task or run_routine is going: its status, its steps in words, the reply so far, and anything it's waiting for. A question you can answer with respond_to_task. An approval only the user can answer, in Blueberry.",
      shape: { taskId: z.string().min(1) },
      readOnly: true,
      run: async ({ taskId }) => {
        const found = task(String(taskId));
        if (!found) return NO_TASK(String(taskId));
        return { text: fromWeb(found), summary: `${found.agent}: ${found.status}` };
      },
    },
    {
      name: "list_tasks",
      title: "List tasks",
      description: "Tasks started from apps such as this one, newest first.",
      shape: {},
      readOnly: true,
      run: async () => {
        const chats = host
          .chatsFromApps()
          .slice(0, MAX_LISTED_TASKS)
          .flatMap((summary) => {
            const chat = host.chat(summary.id);
            if (!chat) return [];
            const { id, agent, status, from } = chatTask(chat);
            return [{ id, title: chat.title, agent, status, from, updatedAt: at(chat.updatedAt) }];
          });
        const routines = [...routineTasks.keys()]
          .reverse()
          .slice(0, MAX_LISTED_TASKS)
          .flatMap((id) => {
            const found = routineTask(id);
            return found ? [{ id, title: found.routine, agent: found.agent, status: found.status, startedAt: found.startedAt }] : [];
          });
        return { text: fromWeb([...routines, ...chats]), summary: count(chats.length + routines.length, "task") };
      },
    },
    {
      name: "cancel_task",
      title: "Stop a task",
      description: "Stop a task. Anything it was waiting for is cancelled with nothing done.",
      shape: { taskId: z.string().min(1) },
      readOnly: false,
      run: async ({ taskId }) => {
        const id = String(taskId);
        const runId = runIdOf(id);
        if (!task(id)) return NO_TASK(id);
        const started = routineTasks.get(id);
        if (started) {
          // Still waiting for a place, so it's taken out of the queue and never starts.
          const queued = started.runId === null && !started.cancelled && host.cancelRoutineRequest(started.routineId);
          if (queued) started.cancelled = true;
          else if (!runId || !host.stopRoutineRun(runId)) return failed("That routine run isn't going.", "Not running");
        } else {
          if (!host.isRunning(id)) return failed("That task has already ended.", "Already ended");
          host.stop(id);
        }
        return { text: json({ taskId: id, status: "stopped" }), summary: "Stopped a task" };
      },
    },
    {
      name: "respond_to_task",
      title: "Answer a task's question",
      description:
        "Answer a question a task asked, when get_task says it has_question. This never answers an approval: only the user can allow an action, in Blueberry. Never send a password, a code or card details.",
      shape: { taskId: z.string().min(1), answer: z.string().min(1).max(MAX_ANSWER_LENGTH) },
      readOnly: false,
      run: async ({ taskId, answer }) => {
        const id = String(taskId);
        if (!task(id)) return NO_TASK(id);
        const runId = runIdOf(id);
        const waiting = runId ? host.waiting().find((item) => item.id === runId) : undefined;
        if (!waiting) return failed("That task isn't waiting for an answer.", "Nothing to answer");
        // The approval is the user's decision, and an app saying yes would make the card mean nothing.
        if (!waiting.approval.question) {
          return failed(
            waiting.approval.handoff ? HANDOFF_NOTE : APPROVAL_NOTE,
            waiting.approval.handoff ? "Refused: the user's tab" : "Refused: an approval",
          );
        }
        const words = String(answer).trim();
        if (!words) return failed("Give an answer.", "Empty answer");
        // As from the phone: anything shaped like a code is typed at the computer, so no model sees it.
        if (plausibleCode(words)) {
          return failed(
            "That looks like a code or a password, which never goes through here. Ask the user to answer in Blueberry, or say it in a few more words if it isn't one.",
            "Refused: looked like a code",
          );
        }
        if (!host.answer(runId as string, waiting.approval.id, words))
          return failed("The question was answered or ended just now.", "Too late");
        return {
          text: json({ taskId: id, status: "working", note: "Answered. It carries on. Check with get_task." }),
          summary: "Answered a question",
        };
      },
    },
    ...browsingTools(host, liveMascots),
  ];
  return tools;
};
