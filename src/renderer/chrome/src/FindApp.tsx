import React, { useEffect, useRef, useState } from "react";
import type { FindResult, ThemeState } from "@shared/ipc";
import { FindBarCard } from "./components/FindBarCard";
import { useFromMain } from "@common/lib/latest";

// The find bar, floating over the page in its own view. Main shows the view and says when.
export const FindApp: React.FC = () => {
  const [theme] = useFromMain<ThemeState | null>(null, window.chromeAPI.theme.getTheme, window.chromeAPI.theme.onThemeUpdated);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<FindResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    const api = window.chromeAPI;
    const unsubscribe = [
      api.find.onResult(setResult),
      // The last search is still there to search again or type over, on whichever page this is now.
      api.find.onOpened(() => {
        input.current?.focus();
        input.current?.select();
        setResult(null);
        if (latest.current) void api.find.search(latest.current);
      }),
    ];
    return () => unsubscribe.forEach((off) => off());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme?.isDark ?? false);
  }, [theme?.isDark]);

  if (!theme) return null;

  return (
    // Room round the card for its shadow, as Layout.ts sizes the view (FIND_BAR).
    <div className="pt-3 pr-3 pb-10 pl-6">
      <FindBarCard
        inputRef={input}
        value={value}
        onChange={(text) => {
          setValue(text);
          setResult(null);
          void window.chromeAPI.find.search(text);
        }}
        result={result}
        onStep={(forward) => void window.chromeAPI.find.step(forward)}
        onClose={() => void window.chromeAPI.find.close()}
      />
    </div>
  );
};
