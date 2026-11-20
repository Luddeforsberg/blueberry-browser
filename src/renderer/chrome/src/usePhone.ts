import { useFromMain } from "@common/lib/latest";
import type { PhoneState } from "@shared/ipc";

const OFF: PhoneState = { status: "off", botName: null, pairLink: null, problem: null };

export const usePhone = () => {
  const [state, setState] = useFromMain(OFF, window.chromeAPI.phone.state, window.chromeAPI.phone.onUpdated);
  return [state, setState] as const;
};
