import { z } from "zod";
import { approvalFromRow, stepsFromRow, type CloudJobStatus } from "../../src/main/cloudJobs";
import { UNTRUSTED_NOTE, type McpTool, type McpToolResult } from "../../src/main/mcpTools";
import type { MascotProfile } from "../../src/shared/library";
import { BERRY, NOWHERE, narrowSites, normaliseSite, permissionsInWords } from "../../src/shared/mascots";
import { snapshotOf } from "../../src/shared/phone";

// What ChatGPT and Claude can ask of the flock in the cloud, through the relay. Each call is a `relay_*` function, as the
// runner with the grant the user made when they signed in, which acts as the user for that one thing. A job is the same
// row the phone sends, so the runner takes it and checks it like any other. Nothing here answers anything: questions,
// approvals and sign-ins are the user's, in Blueberry or on the phone, and there's no database function for the relay
// that could, nor any route to cookies, logins, recordings or memory.

const MAX_TASK_LENGTH = 4000;
const MAX_SITES = 20;

const NOT_YOURS =
  "Only the user can answer this, in Blueberry or on their phone, and nothing you send can. Tell the user it's waiting " +
  "for them, then check again with get_job.";

// Everything the tools need, for one connection. The database keeps it to the jobs this connection started.
export interface RelayHost {
  flock: () => Promise<MascotProfile[]>;
  // The database adds the Context of the user's newest job that has one, as the phone does.
  startJob: (prompt: string, mascot: object) => Promise<string>;
  // Status, steps, reply, error and any approval waiting, for these jobs or, with null, the newest.
  jobs: (ids: string[] | null) => Promise<Record<string, unknown>[]>;
  stop: (id: string) => Promise<void>;
}

const json = (data: unknown) => JSON.stringify(data, null, 2);
const fromWeb = (data: unknown) => `${UNTRUSTED_NOTE}\n\n${json(data)}`;
const failed = (text: string, summary: string): McpToolResult => ({ text, isError: true, summary });

const findBird = (flock: MascotProfile[], wanted: string | undefined) => {
  const name = wanted?.trim().toLowerCase();
  if (!name) return BERRY;
  return flock.find((bird) => bird.id.toLowerCase() === name || bird.name.toLowerCase() === name) ?? null;
};

// What a job is waiting for, in words. Nothing of it can be answered from here.
const waitingFor = (row: Record<string, unknown>) => {
  const approval = approvalFromRow(row);
  if (!approval) return null;
  if (approval.question) return { kind: "question", question: approval.text, note: NOT_YOURS };
  if (approval.handoff) return { kind: "user_in_page", needs: approval.text, note: "The user has to do this in the page themselves, from Blueberry or their phone. No password or code goes through you." };
  return { kind: "approval", wouldLike: approval.text, note: NOT_YOURS };
};

const statusOf = (status: unknown, waiting: boolean): string => {
  if (waiting) return "waiting_for_user";
  // Waiting with nothing left to answer is the moment after the user answered: it carries on.
  if (status === "waiting") return "running";
  const known: CloudJobStatus[] = ["queued", "running", "done", "failed", "stopped"];
  return known.includes(status as CloudJobStatus) ? String(status) : "unknown";
};

export const createRelayTools = (host: RelayHost): McpTool[] => {
  const job = async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await host.jobs([id]);
    if (!row) return null;
    const waiting = waitingFor(row);
    return {
      jobId: id,
      status: statusOf(row.status, waiting !== null),
      steps: stepsFromRow(row.steps).map(({ text }) => text),
      reply: typeof row.reply === "string" && row.reply ? row.reply : null,
      error: typeof row.error === "string" && row.error ? row.error : null,
      waitingFor: waiting,
    };
  };

  return [
    {
      name: "list_agents",
      title: "List the flock",
      description: "The user's birds (agents) in Blueberry, as their Mac last shared them: each one's name, what it's for, and the sites it may use and what it may do, in words. Berry is always first and has no limits.",
      shape: {},
      readOnly: true,
      run: async () => {
        const birds = (await host.flock()).map((bird) => ({
          id: bird.id,
          name: bird.name,
          for: bird.id === BERRY.id ? "Anything. Berry is the user's general assistant in the browser." : bird.instructions,
          sites: bird.sites.length > 0 ? bird.sites : "any",
          permissions: permissionsInWords(bird).map(({ text }) => text),
        }));
        return { text: json(birds), summary: `${birds.length} birds` };
      },
    },
    {
      name: "start_job",
      title: "Give a bird a job",
      description:
        "Start a job in the cloud for one of the user's birds, by name or id from list_agents, or Berry if you leave it out. It works in a browser in the cloud, signed in to the sites the user brought there, keeps going with their computer off, and asks the user before anything risky. `sites` keeps it to those sites, and can only narrow what the bird may do. Returns a job id at once: check on it with get_job.",
      shape: {
        task: z.string().min(1).max(MAX_TASK_LENGTH).describe("What to do, in plain words, as you'd ask a person."),
        agent: z.string().max(100).optional().describe("The bird's name or id. Leave out for Berry."),
        sites: z.array(z.string().max(200)).max(MAX_SITES).optional().describe("Only these sites, such as example.com. Leave out for the bird's own."),
      },
      readOnly: false,
      run: async ({ task, agent, sites }) => {
        const prompt = String(task ?? "").trim().slice(0, MAX_TASK_LENGTH);
        if (!prompt) return failed("Say what the job is.", "Empty task");
        const bird = findBird(await host.flock(), typeof agent === "string" ? agent : undefined);
        if (!bird) return failed(`There's no bird called ${String(agent)}. list_agents names them.`, "No such bird");
        const given = Array.isArray(sites) ? sites.map(String) : [];
        const clean = given.map((site) => normaliseSite(site));
        const bad = given.find((_, index) => clean[index] === null);
        if (bad !== undefined) return failed(`“${bad}” doesn't look like a site. Try something like example.com.`, "Bad site");
        // Only ever narrower: a bird kept to some sites can't be sent anywhere else.
        const narrowed = narrowSites(bird.sites, clean as string[]);
        if (narrowed.includes(NOWHERE)) return failed(`${bird.name} may only use ${bird.sites.join(", ")}, and none of those sites are among them.`, "Sites outside its limits");
        const id = await host.startJob(prompt, { ...snapshotOf(bird), sites: narrowed });
        return {
          text: json({
            jobId: id,
            agent: bird.name,
            status: "queued",
            note: "It runs in the cloud and can take a few minutes. Check on it with get_job. It may stop to ask the user, who answers in Blueberry or on their phone.",
          }),
          summary: "Started a job",
        };
      },
    },
    {
      name: "get_job",
      title: "Check on a job",
      description: "How a job from start_job is going: its status, its steps in words, its reply, and anything it's waiting for. Whatever it waits for, only the user can answer.",
      shape: { jobId: z.string().min(1).max(100) },
      readOnly: true,
      run: async ({ jobId }) => {
        const found = await job(String(jobId));
        if (!found) return failed(`There's no job ${String(jobId)} from here. list_jobs names them.`, "No such job");
        return { text: fromWeb(found), summary: found.status };
      },
    },
    {
      name: "list_jobs",
      title: "List jobs",
      description: "Jobs started from here, newest first, with each one's status.",
      shape: {},
      readOnly: true,
      run: async () => {
        const listed = (await host.jobs(null)).map((row) => ({ jobId: String(row.id), status: statusOf(row.status, approvalFromRow(row) !== null) }));
        return { text: json(listed), summary: `${listed.length} jobs` };
      },
    },
    {
      name: "stop_job",
      title: "Stop a job",
      description: "Stop a job from start_job. Anything it was waiting for is cancelled with nothing done.",
      shape: { jobId: z.string().min(1).max(100) },
      readOnly: false,
      run: async ({ jobId }) => {
        const found = await job(String(jobId));
        if (!found) return failed(`There's no job ${String(jobId)} from here. list_jobs names them.`, "No such job");
        if (["done", "failed", "stopped"].includes(found.status)) return failed("That job has already ended.", "Already ended");
        await host.stop(found.jobId);
        return { text: json({ jobId: found.jobId, status: "stopping" }), summary: "Stopped a job" };
      },
    },
  ];
};
