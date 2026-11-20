import { useEffect, useState } from "react";
import type { AiKeyState, AiKeyTried, AiService } from "@shared/aiKey";

export const SERVICES: Record<AiService, { name: string; models: string }> = {
  openai: { name: "OpenAI", models: "GPT models" },
  anthropic: { name: "Anthropic", models: "Claude models" },
};

const NONE: AiKeyState = { service: null, last4: null };

export const useAiKey = () => {
  const [state, setState] = useState(NONE);
  useEffect(() => {
    void window.chromeAPI.aiKey.state().then(setState);
    return window.chromeAPI.aiKey.onUpdated(setState);
  }, []);
  return state;
};

export const aiServiceName = (service: AiService) => SERVICES[service].name;

export type Said = AiKeyTried | "trying" | "nothing-to-paste" | null;

// The chosen service, what's in the field, and how the last try went. `works` is true once a key is kept, whether it was
// just tried or saved before.
export const useKeyTry = () => {
  const saved = useAiKey();
  const [chosen, setChosen] = useState<AiService | null>(null);
  const service = chosen ?? saved.service ?? "openai";
  const [key, setKey] = useState("");
  const [said, setSaid] = useState<Said>(null);
  const tryKey = async () => {
    if (!key.trim() || said === "trying") return;
    setSaid("trying");
    const { outcome } = await window.chromeAPI.aiKey.tryKey(service, key);
    // Kept in main now, so it goes from here.
    if (outcome === "works") setKey("");
    setSaid(outcome);
  };
  return {
    saved,
    service,
    choose: (next: AiService) => {
      setChosen(next);
      // What's in the field was for the other service, and must never be tried with this one.
      if (next !== service) setKey("");
      setSaid(null);
    },
    key,
    setKey: (next: string) => {
      setKey(next);
      setSaid(null);
    },
    said,
    tryKey,
    paste: async () => {
      const pasted = await window.chromeAPI.aiKey.paste(service);
      if (pasted) setKey(pasted);
      setSaid(pasted ? null : "nothing-to-paste");
    },
    works: saved.service === service && said !== "trying" && !key,
    canTry: !!key.trim() && said !== "trying",
  };
};

export type KeyTry = ReturnType<typeof useKeyTry>;
