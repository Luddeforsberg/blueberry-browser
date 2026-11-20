import { framesPassed } from "./frames";
import type { ActorApi } from "./install";

export type ActorCommand = Exclude<keyof ActorApi, "key">;

// Main sends each command what it takes, as JSON, so here any of them takes an object. A method's parameter is checked
// both ways, which is what lets this one signature stand for every command.
type AnyCommand = { run(args: object): unknown }["run"];

export const actorCommand = ({ key, name, args }: { key: string; name: ActorCommand; args: object }): unknown => {
  const api = globalThis.__berryActor;
  if (api?.key !== key) return "absent";
  const command: AnyCommand = api[name];
  return command.call(api, args);
};

// For anything that shouldn't bring the mascot back if it isn't there.
export const ifThere = ({ name, args }: { name: ActorCommand; args: object }): unknown => {
  const api = globalThis.__berryActor;
  if (!api) return undefined;
  const command: AnyCommand = api[name];
  return command.call(api, args);
};

// Before a capture: out of sight, and answered once the frame without it is handed over. That's waited for with no
// mascot here too, since one taken away just now may still be in the last frame.
export const beforeCapture = (): Promise<true> => {
  globalThis.__berryActor?.hide();
  return framesPassed({ shown: false });
};
