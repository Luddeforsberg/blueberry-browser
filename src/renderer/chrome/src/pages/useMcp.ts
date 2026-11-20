import { useFromMain } from "@common/lib/latest";
import type { McpState } from "@shared/ipc";

const OFF: McpState = { on: false, url: null, problem: null, snippets: [], activity: [] };

export const useMcp = () => {
  const [state, setState] = useFromMain(OFF, window.chromeAPI.mcp.state, window.chromeAPI.mcp.onUpdated);
  return [state, setState] as const;
};
