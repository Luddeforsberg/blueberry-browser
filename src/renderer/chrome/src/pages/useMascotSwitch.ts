import { useEffect, useRef, useState } from "react";
import type { MascotProfile } from "@shared/library";
import { useShell } from "../contexts/useShell";
import type { PillFace } from "../components/Composer";

// DESIGN.md section 10, Choosing a mascot: the old one's eyes shut, the new one pops in at 120ms with the pips for a
// face, and its eyes open at 420ms. Held still, it's a short fade. Choosing again partway starts over from there.
const ARRIVES_MS = 120;

const SETTLED_MS = 420;

export const useMascotSwitch = (chosen: MascotProfile) => {
  const { keepBerryStill } = useShell().settings;
  const [shown, setShown] = useState(chosen);
  const [phase, setPhase] = useState<"rest" | "shut" | "arriving">("rest");
  const [arrival, setArrival] = useState(0);
  // Who's showing, and the latest of who's chosen, so a library update partway doesn't start the switch again.
  const showing = useRef(chosen.id);
  const latest = useRef(chosen);
  latest.current = chosen;

  // The same mascot, saved again: show what it is now.
  useEffect(() => {
    if (chosen.id === showing.current) setShown(chosen);
  }, [chosen]);

  useEffect(() => {
    const arrive = () => {
      showing.current = latest.current.id;
      setShown(latest.current);
      setArrival((count) => count + 1);
    };
    // Chosen back before the next one arrived, or held still: whatever was under way is over, so the face opens.
    if (chosen.id === showing.current || keepBerryStill) {
      if (chosen.id !== showing.current) arrive();
      setPhase("rest");
      return;
    }
    setPhase("shut");
    const arriving = window.setTimeout(() => {
      arrive();
      setPhase("arriving");
    }, ARRIVES_MS);
    const settle = window.setTimeout(() => setPhase("rest"), SETTLED_MS);
    return () => {
      window.clearTimeout(arriving);
      window.clearTimeout(settle);
    };
  }, [chosen.id, keepBerryStill]);

  const face: PillFace = { mood: phase === "arriving" ? "fetching" : "rest", shut: phase === "shut", arrival };
  return { shown, face, switching: phase !== "rest", still: keepBerryStill };
};
