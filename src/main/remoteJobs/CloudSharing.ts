import { sharedMascotRows } from "../../shared/phone";
import type { CloudRoutineRow } from "./cloudJobs";
import type { RunnerParts } from "./runnerTypes";

// What's kept in the cloud from here while a linked runner has accepted: the mascots, for the phone page, and the
// routines that run there.
export class CloudSharing {
  // What was last shared, and by whom, so an unchanged list isn't sent again.
  private sharedMascots: string | null = null;
  // What was last sent of each routine, by key, and for which account. Its first time isn't part of it, as the server
  // owns when it's due. `reconciled` is the set of keys last checked against the server's, null until that's worked.
  private sharedRoutines: { account: string; rows: Map<string, string>; reconciled: string | null } | null = null;
  private routinesSending: Promise<void> | null = null;
  // Routines that may be in the cloud, by key: sent there, and not yet known to be gone. Saved, so one turned off before
  // a restart stays held back here until the server confirms it's gone.
  readonly routinesThere = new Set<string>();
  // Routines whose last send failed.
  private readonly routinesFailed = new Set<string>();
  private routinesAgain = false;
  private mascotsSending: Promise<void> | null = null;
  private mascotsAgain = false;

  private readonly server: RunnerParts["server"];
  private readonly hooks: RunnerParts["hooks"];
  private readonly parts: Pick<RunnerParts, "signedIn" | "link" | "destroyed" | "withToken" | "save">;

  constructor(parts: Pick<RunnerParts, "server" | "hooks" | "signedIn" | "link" | "destroyed" | "withToken" | "save">) {
    this.server = parts.server;
    this.hooks = parts.hooks;
    this.parts = parts;
  }

  private get signedIn(): string | null {
    return this.parts.signedIn();
  }

  private get link(): ReturnType<RunnerParts["link"]> {
    return this.parts.link();
  }

  private get destroyed(): boolean {
    return this.parts.destroyed();
  }

  private withToken<T>(account: string, call: (token: string) => Promise<T>): Promise<T | null> {
    return this.parts.withToken(account, call);
  }

  private save(): void {
    this.parts.save();
  }

  // Shares the mascots with the phone page, only while signed in with a runner that has accepted, and only if it changed.
  // A mascot's name, look, instructions and limits go, and nothing it remembers. One send at a time, and a change that
  // comes in meanwhile is sent after it, so an older list never lands after a newer one.
  // Keeps the routines that run in the cloud there, one call per routine that changed or went, one round at a time.
  async routinesChanged(): Promise<void> {
    if (this.routinesSending) {
      this.routinesAgain = true;
      return this.routinesSending;
    }
    this.routinesSending = (async () => {
      do {
        this.routinesAgain = false;
        await this.shareRoutines();
      } while (this.routinesAgain);
    })().finally(() => {
      this.routinesSending = null;
    });
    return this.routinesSending;
  }

  private async shareRoutines(): Promise<void> {
    const account = this.signedIn;
    if (!account || !this.link?.accepted || !this.hooks.routines) return;
    const rows = this.hooks.routines();
    if (!rows) return;
    if (this.sharedRoutines?.account !== account) this.sharedRoutines = { account, rows: new Map(), reconciled: null };
    const shared = this.sharedRoutines;
    const before = JSON.stringify([[...this.routinesThere].sort(), [...this.routinesFailed].sort()]);
    for (const row of rows) {
      const shape = JSON.stringify({ ...row, firstRunAt: null });
      if (shared.rows.get(row.key) === shape) continue;
      // Tried again on the next change or the next look at the link.
      const synced = await this.withToken(account, (token) => this.server!.syncCloudRoutine(token, row).then(() => true));
      if (this.destroyed) return;
      if (synced) {
        shared.rows.set(row.key, shape);
        this.routinesThere.add(row.key);
        this.routinesFailed.delete(row.key);
      } else this.routinesFailed.add(row.key);
    }
    await this.reconcileRoutines(account, shared, rows);
    if (this.destroyed) return;
    [...this.routinesFailed].filter((key) => !rows.some((row) => row.key === key)).forEach((key) => this.routinesFailed.delete(key));
    if (JSON.stringify([[...this.routinesThere].sort(), [...this.routinesFailed].sort()]) !== before) {
      this.save();
      this.hooks.routinesSettled?.();
    }
  }

  private async reconcileRoutines(
    account: string,
    shared: NonNullable<CloudSharing["sharedRoutines"]>,
    rows: CloudRoutineRow[],
  ): Promise<void> {
    // Anything there that this no longer has goes, checked against the server's own keys, so one deleted or turned off
    // while it couldn't be reached, or before a restart, still goes. Only when the keys here change, or until it's worked.
    const keys = rows.map(({ key }) => key);
    const local = JSON.stringify([...keys].sort());
    if (shared.reconciled === local) return;
    const there = await this.withToken(account, (token) => this.server!.myCloudRoutineKeys(token));
    if (!there) return;
    // Whatever the server doesn't have is known to be gone.
    [...this.routinesThere].filter((key) => !there.includes(key)).forEach((key) => this.routinesThere.delete(key));
    there.forEach((key) => this.routinesThere.add(key));
    let gone = true;
    for (const key of there.filter((key) => !keys.includes(key))) {
      const forgotten = await this.withToken(account, (token) => this.server!.forgetCloudRoutine(token, key).then(() => true));
      if (forgotten) {
        shared.rows.delete(key);
        this.routinesThere.delete(key);
      } else gone = false;
    }
    if (gone) shared.reconciled = local;
  }

  // A routine that may still be in the cloud, where it could run. One turned off stays so until the server says it's gone.
  stillInCloud(key: string): boolean {
    return this.routinesThere.has(key);
  }

  cloudFailed(key: string): boolean {
    return this.routinesFailed.has(key);
  }

  async mascotsChanged(): Promise<void> {
    if (this.mascotsSending) {
      this.mascotsAgain = true;
      return this.mascotsSending;
    }
    this.mascotsSending = (async () => {
      do {
        this.mascotsAgain = false;
        await this.shareMascots();
      } while (this.mascotsAgain);
    })().finally(() => {
      this.mascotsSending = null;
    });
    return this.mascotsSending;
  }

  private async shareMascots(): Promise<void> {
    const account = this.signedIn;
    if (!account || !this.link?.accepted || !this.hooks.mascots) return;
    const rows = sharedMascotRows(this.hooks.mascots());
    const shared = JSON.stringify([account, rows]);
    if (shared === this.sharedMascots) return;
    this.sharedMascots = shared;
    const sent = await this.withToken(account, (token) => this.server!.syncCloudMascots(token, rows).then(() => true));
    // Tried again on the next change or the next look at the link.
    if (!sent && this.sharedMascots === shared) this.sharedMascots = null;
  }
}
