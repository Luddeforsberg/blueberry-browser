import React, { useEffect, useLayoutEffect, useRef } from "react";
import type { PermissionPrompt, ThemeState } from "@shared/ipc";
import { PermissionCard } from "@common/components/PermissionCard";
import { useFromMain } from "@common/lib/latest";

const permissions = () => window.chromeAPI.permissions;

// The view over the page that asks about a site's request. It's as tall as the card, so the rest of the page
// keeps its clicks.
export const PromptApp: React.FC = () => {
  const [prompt] = useFromMain<PermissionPrompt | null>(null, permissions().current, permissions().onPrompt);
  const content = useRef<HTMLDivElement>(null);

  const [theme] = useFromMain<ThemeState | null>(null, window.chromeAPI.theme.getTheme, window.chromeAPI.theme.onThemeUpdated);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme?.isDark ?? false);
  }, [theme?.isDark]);

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const observer = new ResizeObserver(() => void permissions().resizePrompt(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={content} className="px-6 pt-4 pb-8">
      {prompt && <PermissionCard key={prompt.id} prompt={prompt} onDecide={(allow) => void permissions().decide(prompt.id, allow)} />}
    </div>
  );
};
