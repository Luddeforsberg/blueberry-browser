import React from "react";
import { Eye } from "lucide-react";
import type { ActionApproval, Appearance, LayoutMode } from "@shared/ipc";
import { Choice, Switch } from "@common/components/Controls";
import { LABEL } from "@common/components/StatusPill";
import type { ShellContextType } from "../contexts/useShell";
import { WindowPicture } from "./WindowPicture";
import { cn } from "@common/lib/utils";
import { Berry } from "./Berry";

// Part of the first run (FirstRun.tsx): the steps that are real settings, Make it yours and What I can see.

// A small drawing of the window as it is now, beside Make it yours. It follows the real window, which changes too.
export const MiniWindow: React.FC<{ tabs: LayoutMode }> = ({ tabs }) => {
  const page = (
    <span className="flex-1 rounded-[8px] bg-sheet shadow-[0_0_0_1px_var(--line)] flex flex-col items-center justify-center gap-1.5">
      <span className="flex items-center gap-[5px]">
        <Berry size={12} still />
        <b className="w-[46px] h-[7px] rounded-[3px] bg-ink" />
      </span>
      <span className="w-[120px] h-[26px] rounded-[7px] bg-ground shadow-[0_0_0_1px_var(--line)]" />
      <span className="w-24 h-[5px] rounded-[2px] bg-dot" />
      <span className="w-[70px] h-[5px] rounded-[2px] bg-dot" />
    </span>
  );
  const bar = (on: number, count: number, className: string) =>
    Array.from({ length: count }, (_, index) => (
      <i key={index} className={cn("h-2.5 rounded-[4px]", className, index === on ? "bg-sheet shadow-chip" : "bg-dot")} />
    ));
  return (
    <div aria-hidden className="w-[270px] h-[178px] p-[7px] flex gap-[7px] rounded-[11px] bg-ground shadow-up">
      {tabs === "vertical" ? (
        <>
          <span className="w-[62px] flex flex-col gap-[5px]">
            <span className="h-[11px] p-[1.5px] rounded-[4px] bg-tray">
              <i className="block w-[27px] h-full rounded-[3px] bg-sheet" />
            </span>
            {bar(2, 4, "")}
            <span className="mt-auto h-4 px-1 flex items-center gap-[3px] rounded-[6px] bg-tray">
              {[0, 1, 2].map((index) => (
                <Berry key={index} size={10} still />
              ))}
            </span>
          </span>
          {page}
        </>
      ) : (
        <span className="flex-1 flex flex-col gap-[5px]">
          <span className="flex gap-1">{bar(2, 4, "flex-1")}</span>
          <span className="h-[11px] flex items-center gap-[3px]">
            <i className="flex-1 h-[9px] rounded-[4px] bg-tray" />
            <Berry size={10} still />
            <Berry size={10} still />
          </span>
          {page}
        </span>
      )}
    </div>
  );
};

// What I can see: one of the settings under Up to you, its name and a line on the left and its control on the right.
const Setting: React.FC<{ id: string; title: string; line: string; children: React.ReactNode }> = ({ id, title, line, children }) => (
  <div className="py-[11px] flex items-center gap-4 text-left [&+&]:border-t [&+&]:border-line">
    <span className="flex-1 min-w-0">
      <span id={id} className="block text-14 font-medium text-ink">
        {title}
      </span>
      <span className="block text-13 text-ink-2">{line}</span>
    </span>
    {children}
  </div>
);

type Shell = Pick<ShellContextType, "settings" | "updateSettings">;

// Make it yours: the theme and where the tabs go, each a real setting.
export const MakeItYours: React.FC<Shell> = ({ settings, updateSettings }) => (
  <>
    <p className={cn("mt-1 mb-2", LABEL)}>Theme</p>
    <Choice<Appearance>
      label="Theme"
      value={settings.appearance}
      onChange={(appearance) => updateSettings({ appearance })}
      options={[
        { value: "light", label: "Light", picture: <WindowPicture mode="light" /> },
        { value: "dark", label: "Dark", picture: <WindowPicture mode="dark" /> },
        { value: "system", label: "System", picture: <WindowPicture mode="system" /> },
      ]}
    />
    <p className={cn("mt-4 mb-2", LABEL)}>Tabs</p>
    <Choice<LayoutMode>
      label="Tabs"
      value={settings.layoutMode}
      onChange={(layoutMode) => updateSettings({ layoutMode })}
      options={[
        { value: "vertical", label: "On the side", picture: <WindowPicture tabs="side" /> },
        { value: "horizontal", label: "On top", picture: <WindowPicture tabs="top" /> },
      ]}
    />
  </>
);

// What I can see: the one thing that's always true, then the settings under Up to you.
export const WhatICanSee: React.FC<Shell> = ({ settings, updateSettings }) => (
  <>
    <p className="py-3 px-3.5 flex gap-[11px] rounded-[14px] bg-card-2 text-13 leading-[20px] text-ink-2 text-left">
      <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-ink" strokeWidth={1.75} />
      <span>
        <b className="font-medium text-ink">I read a page only when you ask,</b> and the chat always shows which one. That part isn’t a
        setting.
      </span>
    </p>
    <p className={cn("mt-3.5 text-left", LABEL)}>Up to you</p>
    <Setting id="see-ask" title="Ask before I act" line="When risky is before I delete, send or buy.">
      {/* Never is only in Settings, where what it risks is said. */}
      <Choice<ActionApproval>
        label="Ask before I act"
        value={settings.actionApproval}
        onChange={(actionApproval) => updateSettings({ actionApproval })}
        options={[
          { value: "risky", label: "When risky" },
          { value: "always", label: "Always" },
        ]}
        className="bg-card-2"
      />
    </Setting>
    <Setting id="see-suggestions" title="Suggestions from your history" line="A summary of it goes to the AI service.">
      <Switch labelledBy="see-suggestions" checked={settings.suggestions} onChange={(suggestions) => updateSettings({ suggestions })} />
    </Setting>
    <Setting id="see-memory" title="Offers to remember what you tell me" line="Only what you say yes to is kept, on this computer.">
      <Switch labelledBy="see-memory" checked={settings.memoryOffers} onChange={(memoryOffers) => updateSettings({ memoryOffers })} />
    </Setting>
  </>
);
