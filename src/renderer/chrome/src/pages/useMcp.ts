import { useEffect, useState } from "react";
import type { McpState } from "@shared/ipc";

const OFF: McpState = { on: false, url: null, problem: null, snippets: [], activity: [] };

export const useMcp = () => {
  const [state, setState] = useState(OFF);
  useEffect(() => {
    void window.chromeAPI.mcp.state().then(setState);
    return window.chromeAPI.mcp.onUpdated(setState);
  }, []);
  return [state, setState] as const;
};
