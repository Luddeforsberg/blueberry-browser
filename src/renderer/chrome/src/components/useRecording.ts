import { useEffect, useState } from "react";
import type { RecordingState } from "@shared/library";
import { useShell } from "../contexts/useShell";

const IDLE: RecordingState = { status: "idle", startedAt: null, steps: [], cut: null, error: null };

// The chrome always listens (`ChromeApp`), so a page that opens while it watches, as the new tab does, starts from this.
let lastHeard = IDLE;

export const useRecording = (): RecordingState => {
  const [state, setState] = useState(lastHeard);
  useEffect(() => {
    const { state: read, onUpdated } = window.chromeAPI.recording;
    const hear = (next: RecordingState) => {
      lastHeard = next;
      setState(next);
    };
    void read().then(hear);
    return onUpdated(hear);
  }, []);
  return state;
};

export const NARROW_PAGE = 640;

// The bookmark star gives way to the recorder beside the chat panel on a narrow page.
export const useRecorderNeedsRoom = () => {
  const { layout } = useShell();
  return useRecording().status === "recording" && layout.page.width < NARROW_PAGE;
};
