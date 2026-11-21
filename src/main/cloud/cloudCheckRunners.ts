// Cloud runners for the cloud's model checker, in the same fake Browserbase as the app: each job a session of its own,
// made with the runners' mark and the job, ended when the job is, and runners starting while others still work, as
// overlapping deploys do, to end what's left from jobs that are over. Which jobs are over goes through the runner's own
// reading of what the server answers, which may be an empty body or something odd. Each job's session is made with a
// key of its own, so the world can tell whose session a release ends, whatever the code sends with it.
import { liveJobsOf } from "../remoteJobs/cloudJobs";
import { browserbase } from "./browserbase";
import { CloudSessions } from "./cloudBrowser";
import type { Breaks } from "./cloudCheckApp";
import { nth, quietly } from "./cloudCheckPlan";
import type { CloudWorld } from "./cloudWorldTesting";

const MARK = "runner-mark";
const SWEEPER = "runner-sweeper";
const PROJECT = "proj";

interface Job {
  // The job's id, as the server has it, and its name in the trace.
  job: string;
  name: string;
  // Whether a runner still works on it, within its lease.
  live: boolean;
  sessions: CloudSessions;
}

export class Runners {
  // By the key its session is made with.
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly world: CloudWorld,
    private readonly breaks: Breaks,
  ) {
    world.accept(SWEEPER, PROJECT);
    // A job's own runner may end its session. Any other may not while the job goes on.
    world.onRelease = ({ key }, asking) => {
      const job = this.jobs.get(key);
      if (job?.live && asking !== key)
        breaks("killed-live-job", `another runner ended ${job.name}'s session while that job was still going`);
    };
  }

  private get live(): Job[] {
    return [...this.jobs.values()].filter(({ live }) => live);
  }

  // A runner takes a job, and opens a page for it.
  take(n: number): string {
    const name = `rjob-${n}`;
    const job = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const key = `runner-${name}`;
    this.world.accept(key, PROJECT);
    const sessions = new CloudSessions(browserbase({ apiKey: key, projectId: PROJECT, mark: MARK, job }), undefined, {
      onIds: () => true,
    });
    sessions.claim(job);
    quietly(sessions.open(job, `runner-tab-${n}`, "https://shop.example/", { onChange: () => {} }));
    this.jobs.set(key, { job, name, live: true, sessions });
    return `a runner takes ${name} and opens a page`;
  }

  // The job ends, and its runner ends its session.
  finish(index: number): string | null {
    const one = nth(this.live, index);
    if (!one) return null;
    one.live = false;
    quietly(one.sessions.quit());
    return `${one.name} finishes, and its runner ends its session`;
  }

  // Its runner stops without ending anything, and its lease runs out.
  stop(index: number): string | null {
    const one = nth(this.live, index);
    if (!one) return null;
    one.live = false;
    return `the runner working on ${one.name} stops, and its lease runs out`;
  }

  // Another runner starts, and ends the sessions left from jobs that are over, as the server says: the live ones of
  // those asked about, as `how` is 0 and always once the steps are over, or else an empty body, or something odd.
  sweep(how = 0): string {
    const sweeper = browserbase({ apiKey: SWEEPER, projectId: PROJECT, mark: MARK });
    const kind = how % 3;
    // Worked out when the listing comes back, as the server answers then.
    const answer = (asked: string[]) =>
      kind === 1 ? null : kind === 2 ? { jobs: [] } : this.live.map(({ job }) => job).filter((job) => asked.includes(job));
    quietly(sweeper.releaseMarked((jobs) => liveJobsOf(jobs, async (asked) => answer(asked))));
    const says = kind === 1 ? ", though the server's answer is empty" : kind === 2 ? ", though the server's answer is odd" : "";
    return `a runner starts, and ends what's left from jobs that are over${says}`;
  }

  // Once every answer is in, after a sweep: nothing of a job that's over still runs.
  check(): void {
    for (const [id, key] of this.world.runnerRunning) {
      const job = this.jobs.get(key);
      if (job && !job.live) this.breaks("runner-left-running", `${id}, from ${job.name}, which is over, is still running`);
    }
  }
}
