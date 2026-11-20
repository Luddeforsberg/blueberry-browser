import { useFromMain } from "@common/lib/latest";
import type { AccountState } from "@shared/ipc";

// Starts as not set up, so no control shows until main has said there's a server.
const UNKNOWN: AccountState = { status: "not-set-up", email: null, problem: null, problemAbout: null };

export const useAccount = () => {
  const [state, setState] = useFromMain(UNKNOWN, window.chromeAPI.account.state, window.chromeAPI.account.onUpdated);
  return [state, setState] as const;
};
