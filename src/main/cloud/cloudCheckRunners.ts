// Cloud runners for the cloud's model checker, in the same fake Browserbase as the app: each job a session of its own,
// made with the runners' mark and the job, ended when the job is, and runners starting while others still work, as
// overlapping deploys do, to end what's left from jobs that are over. Each job's session is made with a key of its own,
// so the world can tell whose session a release ends, whatever the code sends with it.
import { browserbase } from "./browserbase";
import { CloudSessions } from "./cloudBrowser";
import type { Breaks } from "./cloudCheckApp";
import { nth, quietly } from "./cloudCheckPlan";
import type { CloudWorld } from "./cloudWorldTesting";

const MARK = "runner-mark";
const SWEEPER = "runner-sweeper";
const PROJECT = "proj";

interface Job {
  job: string;
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
        breaks("killed-live-job", `another runner ended ${job.job}'s session while that job was still going`);
    };
  }

  private get live(): Job[] {
    return [...this.jobs.values()].filter(({ live }) => live);
  }

  // A runner takes a job, and opens a page for it.
  take(n: number): string {
    const job = `rjob-${n}`;
    const key = `runner-${job}`;
    this.world.accept(key, PROJECT);
    const sessions = new CloudSessions(browserbase({ apiKey: key, projectId: PROJECT, mark: MARK, job }), undefined, {
      onIds: () => true,
    });
    sessions.claim(job);
    quietly(sessions.open(job, `runner-tab-${n}`, "https://shop.example/", { onChange: () => {} }));
    this.jobs.set(key, { job, live: true, sessions });
    return `a runner takes ${job} and opens a page`;
  }

  // The job ends, and its runner ends its session.
  finish(index: number): string | null {
    const one = nth(this.live, index);
    if (!one) return null;
    one.live = false;
    quietly(one.sessions.quit());
    return `${one.job} finishes, and its runner ends its session`;
  }

  // Its runner stops without ending anything, and its lease runs out.
  stop(index: number): string | null {
    const one = nth(this.live, index);
    if (!one) return null;
    one.live = false;
    return `the runner working on ${one.job} stops, and its lease runs out`;
  }

  // Another runner starts, and ends the sessions left from jobs that are over, as the server says.
  sweep(): string {
    const sweeper = browserbase({ apiKey: SWEEPER, projectId: PROJECT, mark: MARK });
    // Asked when the listing comes back, as the server answers then.
    const live = () => new Set(this.live.map(({ job }) => job));
    quietly(sweeper.releaseMarked(async (jobs) => new Set(jobs.filter((job) => live().has(job)))));
    return "a runner starts, and ends what's left from jobs that are over";
  }

  // Once every answer is in, after a sweep: nothing of a job that's over still runs.
  check(): void {
    for (const [id, key] of this.world.runnerRunning) {
      const job = this.jobs.get(key);
      if (job && !job.live) this.breaks("runner-left-running", `${id}, from ${job.job}, which is over, is still running`);
    }
  }
}
