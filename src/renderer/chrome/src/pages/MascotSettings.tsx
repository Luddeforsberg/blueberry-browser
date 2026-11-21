import React from "react";
import type { ActionApproval } from "@shared/ipc";
import { shortcutWords, SHORTCUTS } from "@shared/shortcuts";
import { Choice, Switch } from "@common/components/Controls";
import { useShell } from "../contexts/useShell";
import { SettingsGroup, SettingsRow } from "../components/SettingsRow";
import { useFromMain } from "@common/lib/latest";

// Part of Settings (SettingsPage.tsx): the Mascots section.

// The default follows each tool's `whyRisky` in src/main/tools, and `whyCardFor` in askFirst.ts.
const APPROVAL_DESCRIPTIONS: Record<ActionApproval, { description: string; more?: string }> = {
  risky: {
    description: "Berry asks before anything that could delete, send, buy or change text, and before going to a site you didn’t name.",
    more: "Short searches, an address you gave it yourself, and plain pages on sites you named or it has already been on go ahead without asking. Any other address that could carry your data asks first.",
  },
  always: { description: "Berry asks before every click, every typed word and every new page." },
  never: {
    description: "Berry never asks, so it can delete, send or buy without checking with you, even in routines or when a page tricks it.",
  },
};

// Moving, Still and Hidden are the two saved settings Show Berry and Keep Berry still, as one choice.
type Look = "moving" | "still" | "hidden";

const LOOK_DESCRIPTIONS: Record<Look, string> = {
  moving: "They move while they work, and rest when nothing’s happening.",
  still: "Keeps the mascots and stops all their animation. This is automatic with Reduce Motion.",
  hidden: "Plain icons and neutral words, and everything keeps working.",
};

const LOOK_SETTINGS: Record<Look, { showBerry: boolean; keepBerryStill?: boolean }> = {
  moving: { showBerry: true, keepBerryStill: false },
  still: { showBerry: true, keepBerryStill: true },
  hidden: { showBerry: false },
};

export const Mascots: React.FC = () => {
  const { settings, updateSettings, theme } = useShell();
  const [shortcutTaken] = useFromMain(false, window.chromeAPI.desktop.shortcutTaken, undefined, settings.desktopBerry);
  const shortcut = shortcutWords(SHORTCUTS.desktop, theme.platform === "mac");
  const look: Look = !settings.showBerry ? "hidden" : settings.keepBerryStill ? "still" : "moving";

  return (
    <>
      <SettingsGroup label="At work">
        <SettingsRow id="setting-action-approval" title="Ask before acting" {...APPROVAL_DESCRIPTIONS[settings.actionApproval]}>
          <Choice<ActionApproval>
            label="Ask before acting"
            value={settings.actionApproval}
            onChange={(actionApproval) => updateSettings({ actionApproval })}
            options={[
              { value: "risky", label: "When risky" },
              { value: "always", label: "Always" },
              { value: "never", label: "Never" },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          id="setting-mascot-on-pages"
          title="On the page they work in"
          description="While a mascot works in the page you’re looking at, it’s drawn there doing it."
          more="Turn this off if a site reacts badly. Mascots work the same either way."
        >
          <Switch
            labelledBy="setting-mascot-on-pages"
            checked={settings.mascotOnPages}
            onChange={(mascotOnPages) => updateSettings({ mascotOnPages })}
          />
        </SettingsRow>
        <SettingsRow
          id="setting-desktop-berry"
          title="On your desktop"
          description={
            shortcutTaken
              ? `Another app already uses ${shortcut}, so press the mascot to give it a job instead.`
              : `When you leave Blueberry, the mascot waits at the edge of your screen, and ${shortcut} gives it a job from any app.`
          }
          more={`${shortcutTaken ? "" : "Drag it to any edge. "}It can’t see your screen or other apps, and jobs ask just as a chat does, there or in Blueberry. Closing Blueberry’s window takes it away and stops what’s running.`}
        >
          <Switch
            labelledBy="setting-desktop-berry"
            checked={settings.desktopBerry}
            onChange={(desktopBerry) => updateSettings({ desktopBerry })}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup label="How they look">
        <SettingsRow id="setting-mascots-look" title="Mascots" description={LOOK_DESCRIPTIONS[look]}>
          <Choice<Look>
            label="Mascots"
            value={look}
            onChange={(next) => updateSettings(LOOK_SETTINGS[next])}
            options={[
              { value: "moving", label: "Moving" },
              { value: "still", label: "Still" },
              { value: "hidden", label: "Hidden" },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup label="What they offer">
        <SettingsRow
          id="setting-suggestions"
          title="Suggestions"
          description="The new tab offers to take over what you keep doing, from a summary of your last two weeks sent to the AI service."
        >
          <Switch
            labelledBy="setting-suggestions"
            checked={settings.suggestions}
            onChange={(suggestions) => updateSettings({ suggestions })}
          />
        </SettingsRow>
        <SettingsRow
          id="setting-memory-offers"
          title="Offers to remember"
          description="After a job, a mascot may offer to remember how you like something done."
        >
          <Switch
            labelledBy="setting-memory-offers"
            checked={settings.memoryOffers}
            onChange={(memoryOffers) => updateSettings({ memoryOffers })}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
};
