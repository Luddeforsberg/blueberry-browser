import { useFromMain } from "@common/lib/latest";
import type { RunnerState } from "@shared/ipc";

// Starts as not set up, so no control shows until main has said there's a linked runner.
const UNKNOWN: RunnerState = { status: "not-set-up", email: null, problem: null, relayUrl: null };

export const useRunner = () => {
  const [state, setState] = useFromMain(UNKNOWN, window.chromeAPI.cloud.runnerState, window.chromeAPI.cloud.onRunnerUpdated);
  return [state, setState] as const;
};
