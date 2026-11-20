import { useEffect, useState } from "react";
import type { AiKeyState, AiKeyTried, AiService } from "@shared/aiKey";
import { useFromMain, useLatest } from "@common/lib/latest";

export const SERVICES: Record<AiService, { name: string; models: string }> = {
  openai: { name: "OpenAI", models: "GPT models" },
  anthropic: { name: "Anthropic", models: "Claude models" },
};

const NONE: AiKeyState = { service: null, last4: null };

export const useAiKey = () => {
  const [state] = useFromMain(NONE, window.chromeAPI.aiKey.state, window.chromeAPI.aiKey.onUpdated);
  return state;
};

export const aiServiceName = (service: AiService) => SERVICES[service].name;

export type Said = AiKeyTried | "trying" | "nothing-to-paste" | "not-removed" | null;

// The chosen service, what's in the field, and how the last try went. `works` is true once a key is kept, whether it was
// just tried or saved before. A try or a paste answers only for the service and the field it was asked for: choosing
// another service or changing the field leaves its answer nowhere to go.
export const useKeyTry = () => {
  const saved = useAiKey();
  const [chosen, setChosen] = useState<AiService | null>(null);
  const service = chosen ?? saved.service ?? "openai";
  const [key, setKey] = useState("");
  const [said, setSaid] = useState<Said>(null);
  const asks = useLatest();
  // The service can change without a choice, when another window saves a key. What's in the field and any answer still
  // on its way were for the one before, so they go, as they do on a choice.
  useEffect(() => {
    asks.end();
    setKey("");
    setSaid(null);
  }, [asks, service]);
  const tryKey = async () => {
    if (!key.trim() || said === "trying") return;
    const turn = asks.next();
    setSaid("trying");
    const { outcome } = await window.chromeAPI.aiKey.tryKey(service, key);
    if (!turn.current) return;
    // Kept in main now, so it goes from here.
    if (outcome === "works") setKey("");
    setSaid(outcome);
  };
  return {
    saved,
    service,
    choose: (next: AiService) => {
      asks.end();
      setChosen(next);
      // What's in the field was for the other service, and must never be tried with this one.
      if (next !== service) setKey("");
      setSaid(null);
    },
    key,
    setKey: (next: string) => {
      asks.end();
      setKey(next);
      setSaid(null);
    },
    said,
    tryKey,
    // The saved key shows until main has really removed it, and says so when it couldn't.
    remove: async () => {
      const turn = asks.next();
      const { removed } = await window.chromeAPI.aiKey.remove();
      if (!turn.current) return;
      setSaid(removed ? null : "not-removed");
    },
    paste: async () => {
      const turn = asks.next();
      const pasted = await window.chromeAPI.aiKey.paste(service);
      if (!turn.current) return;
      if (pasted) setKey(pasted);
      setSaid(pasted ? null : "nothing-to-paste");
    },
    works: saved.service === service && said !== "trying" && !key,
    canTry: !!key.trim() && said !== "trying",
  };
};

export type KeyTry = ReturnType<typeof useKeyTry>;
