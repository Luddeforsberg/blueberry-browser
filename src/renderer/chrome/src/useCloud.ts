import { useFromMain } from "@common/lib/latest";
import type { CloudState } from "@shared/ipc";

const OFF: CloudState = {
  provider: null,
  configured: false,
  status: "off",
  busy: false,
  canEnd: false,
  unreleased: false,
  unreadable: false,
  problem: null,
  logins: [],
};

// Whether there's a cloud browser, and what it's doing. Never the key.
export const useCloud = () => {
  const [state, setState] = useFromMain(OFF, window.chromeAPI.cloud.state, window.chromeAPI.cloud.onUpdated);
  return [state, setState] as const;
};
