import React from "react";
import { Cloud, Plug, Smartphone, Brain } from "lucide-react";
import type { Appearance, ImportSource, LayoutMode, StartupChoice, TabInfo } from "@shared/ipc";
import { SETTINGS_SECTIONS, settingsPlace, type SettingsPage as StepInPage, type SettingsSection } from "@shared/settingsPlaces";
import { iconMascotId, type AppIconGround } from "@shared/appIcon";
import { BERRY_ID } from "@shared/mascots";
import { Choice } from "@common/components/Controls";
import { useShell } from "../contexts/useShell";
import { More, RowTile, SettingsGroup, SettingsLink, SettingsRow, StepInHeader } from "../components/SettingsRow";
import { SegmentSwitch } from "../components/SegmentSwitch";
import { PageFrame, PageHeader } from "../components/PageFrame";
import { WindowPicture } from "../components/WindowPicture";
import { AppIcon } from "../components/AppIcon";
import { useMascots } from "../contexts/useLibrary";
import { BringInHistory } from "../components/HistoryImport";
import { AiKeyForm } from "../components/AiKeyForm";
import { aiServiceName, useAiKey, useKeyTry } from "../components/useAiKey";
import { ServiceMark } from "../components/ServiceMark";
import { openSettings } from "../openSettings";
import { usePhone } from "../usePhone";
import { useCloud } from "../useCloud";
import { DownloadSettings, SitePermissionsSettings } from "./SiteSettings";
import { useSitePermissions } from "./useSitePermissions";
import { PhoneSettings } from "./PhoneSettings";
import { McpSettings } from "./McpSettings";
import { useMcp } from "./useMcp";
import { CloudSettings } from "./CloudSettings";
import { AccountSettings } from "./AccountSettings";
import { WhatLeaves } from "./WhatLeaves";
import { Mascots } from "./MascotSettings";
import { useFromMain } from "@common/lib/latest";

// DESIGN.md section 10, Settings: one column on the page, five sections along the top, and pages one step in. Where it
// is lives in the tab's param, so the toolbar's Back steps out of a page and another page can open it anywhere.

const SECTION_NAMES: Record<SettingsSection, string> = {
  general: "General",
  mascots: "Mascots",
  privacy: "Privacy",
  connections: "Connections",
  account: "Account",
};

const PAGE_TITLES: Record<StepInPage, string> = {
  "what-leaves": "What leaves this computer",
  "site-permissions": "Site permissions",
  "bring-in-history": "Bring in history",
  "ai-service": "AI service",
  phone: "Phone",
  claude: "Claude and other apps",
  cloud: "Cloud",
};

const STARTUP_DESCRIPTIONS: Record<StartupChoice, { description: string; more?: string }> = {
  restore: {
    description: "Blueberry opens the tabs you had open, each loading when you first go to it.",
    more: "They’re saved on this computer until you close them.",
  },
  fresh: { description: "Blueberry opens a new tab, and doesn’t save your open tabs." },
};

const GROUND_NAMES: Record<AppIconGround, string> = { paper: "Paper", night: "Night", colour: "Its colour", glow: "Glow" };

// Who's on the app's icon and what's behind it. It's outside the window, so it stays when the mascots are hidden.
const AppIconRow: React.FC = () => {
  const { settings, updateSettings, theme } = useShell();
  const { mascots } = useMascots();
  const mascotId = iconMascotId(settings.appIconMascotId, mascots) ?? BERRY_ID;
  const look = mascots.find((mascot) => mascot.id === mascotId)?.look;
  const ground = settings.appIconGround;
  const mac = theme.platform === "mac";
  const label = "mt-3.5 mb-2 text-12 font-medium text-ink-2";
  return (
    <SettingsRow
      id="setting-app-icon"
      title="App icon"
      description={`The mascot on Blueberry’s icon in your ${mac ? "Dock" : "taskbar"}, and what’s behind it.`}
      below={
        <>
          <div className={label}>Who</div>
          <Choice<string>
            label="Who"
            value={mascotId}
            onChange={(id) => updateSettings({ appIconMascotId: id === BERRY_ID ? null : id })}
            className="flex-wrap gap-x-1.5 gap-y-3"
            pictureClassName="size-14 rounded-[25%]"
            options={mascots.map((mascot) => ({
              value: mascot.id,
              label: mascot.name,
              picture: <AppIcon look={mascot.look} ground={ground} size={56} />,
            }))}
          />
          <div className={label}>Behind it</div>
          <Choice<AppIconGround>
            label="Behind it"
            value={ground}
            onChange={(appIconGround) => updateSettings({ appIconGround })}
            className="flex-wrap gap-x-1.5 gap-y-3"
            pictureClassName="size-11 rounded-[25%]"
            options={(Object.keys(GROUND_NAMES) as AppIconGround[]).map((value) => ({
              value,
              label: GROUND_NAMES[value],
              picture: <AppIcon look={look} ground={value} size={44} />,
            }))}
          />
          <p className="mt-3.5 text-13 text-ink-2">
            {mac
              ? "While Blueberry is closed, the Dock shows its usual icon."
              : "A pinned shortcut, and the icon while Blueberry is closed, stay the usual one."}
          </p>
        </>
      }
    >
      <AppIcon look={look} ground={ground} size={72} />
    </SettingsRow>
  );
};

const General: React.FC = () => {
  const { settings, updateSettings } = useShell();
  return (
    <>
      <SettingsGroup label="Look">
        <SettingsRow id="setting-appearance" title="Theme" top>
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
        </SettingsRow>
        <SettingsRow id="setting-tabs" title="Tabs" top>
          <Choice<LayoutMode>
            label="Tabs"
            value={settings.layoutMode}
            onChange={(layoutMode) => updateSettings({ layoutMode })}
            options={[
              { value: "vertical", label: "On the side", picture: <WindowPicture tabs="side" /> },
              { value: "horizontal", label: "On top", picture: <WindowPicture tabs="top" /> },
            ]}
          />
        </SettingsRow>
        <AppIconRow />
      </SettingsGroup>
      <SettingsGroup label="Browsing">
        <SettingsRow id="setting-startup" title="When Blueberry opens" {...STARTUP_DESCRIPTIONS[settings.onStartup]}>
          <Choice<StartupChoice>
            label="When Blueberry opens"
            value={settings.onStartup}
            onChange={(onStartup) => updateSettings({ onStartup })}
            options={[
              { value: "restore", label: "Your tabs" },
              { value: "fresh", label: "A new tab" },
            ]}
          />
        </SettingsRow>
        <DownloadSettings />
      </SettingsGroup>
    </>
  );
};

const Privacy: React.FC = () => {
  const sites = new Set(useSitePermissions().map(({ origin }) => origin)).size;
  const [sources] = useFromMain<ImportSource[] | null>(null, window.chromeAPI.browser.importSources);
  return (
    <>
      <SettingsGroup>
        <SettingsLink
          title="What leaves this computer"
          description="Everything stays here unless it’s on this list."
          onOpen={() => openSettings("what-leaves")}
        />
        <SettingsLink
          title="Site permissions"
          description="Camera, location and the like, by site."
          value={sites === 0 ? "None yet" : `${sites} ${sites === 1 ? "site" : "sites"}`}
          onOpen={() => openSettings("site-permissions")}
        />
      </SettingsGroup>
      <SettingsGroup label="History">
        <SettingsLink
          title="Pages you’ve visited"
          description="Every web page you visit is saved until you delete it or clear your history."
          value="Open"
          onOpen={() => void window.chromeAPI.browser.openPage("history")}
        />
        {/* Only with a browser to bring from, so it never offers something it can't do. */}
        {sources && sources.length > 0 && (
          <SettingsLink title="Bring it in from another browser" onOpen={() => openSettings("bring-in-history")} />
        )}
      </SettingsGroup>
    </>
  );
};

// The service and the key's last four characters, never the key, which main doesn't send.
const AiService: React.FC = () => {
  const keyTry = useKeyTry();
  return (
    <div className="mt-4">
      <AiKeyForm keyTry={keyTry} tryButton onRemove={() => void keyTry.remove()} />
    </div>
  );
};

// Each row's state is a pill, and only what's true: a next step is a raised button beside it, and Set up opens the same
// page as the row. Set up says it isn't set up, so that row has no pill to say it again.
const Connections: React.FC = () => {
  const aiKey = useAiKey();
  const [phone] = usePhone();
  const [mcp] = useMcp();
  const [cloud, setCloud] = useCloud();
  const setUp = (page: StepInPage) => ({ label: "Set up", onAct: () => openSettings(page) });
  const cloudSetUp = cloud.provider === "local" || cloud.configured;
  return (
    <SettingsGroup>
      <SettingsLink
        lead={<RowTile>{aiKey.service ? <ServiceMark service={aiKey.service} size={16} /> : <Brain strokeWidth={1.75} />}</RowTile>}
        title="AI service"
        description="What Berry thinks with, using your own key."
        value={aiKey.service && aiKey.last4 ? `${aiServiceName(aiKey.service)} · ${aiKey.last4}` : undefined}
        action={aiKey.service ? undefined : setUp("ai-service")}
        onOpen={() => openSettings("ai-service")}
      />
      <SettingsLink
        lead={
          <RowTile>
            <Smartphone strokeWidth={1.75} />
          </RowTile>
        }
        title="Phone"
        description="Answer a waiting job from Telegram."
        state={
          phone.status === "connected" ? { words: "Connected", tone: "on" } : phone.status === "pairing" ? { words: "Pairing" } : undefined
        }
        action={phone.status === "off" ? setUp("phone") : undefined}
        onOpen={() => openSettings("phone")}
      />
      <SettingsLink
        lead={
          <RowTile>
            <Plug strokeWidth={1.75} />
          </RowTile>
        }
        title="Claude and other apps"
        description="Apps on this computer can give your mascots jobs."
        state={!mcp.on ? undefined : mcp.url ? { words: "On", tone: "on" } : { words: "Couldn’t start", tone: "ask" }}
        action={mcp.on ? undefined : setUp("claude")}
        onOpen={() => openSettings("claude")}
      />
      <SettingsLink
        lead={
          <RowTile>
            <Cloud strokeWidth={1.75} />
          </RowTile>
        }
        title="Cloud"
        description="Jobs in a cloud browser, and with this computer off."
        state={
          cloud.unreleased
            ? { words: "Session still open", tone: "ask" }
            : !cloudSetUp
              ? undefined
              : cloud.status === "running" || cloud.status === "starting"
                ? { words: "Session open", tone: "on" }
                : { words: "Ready", tone: "on" }
        }
        action={
          cloud.unreleased
            ? { label: "Try again", onAct: () => void window.chromeAPI.cloud.end().then(setCloud) }
            : !cloudSetUp
              ? setUp("cloud")
              : undefined
        }
        onOpen={() => openSettings("cloud")}
      />
    </SettingsGroup>
  );
};

const SECTIONS: Record<SettingsSection, React.FC> = {
  general: General,
  mascots: Mascots,
  privacy: Privacy,
  connections: Connections,
  account: AccountSettings,
};

const STEP_IN: Record<StepInPage, { about?: React.ReactNode; Body: React.FC }> = {
  "what-leaves": {
    about:
      "Everything is kept on this computer unless it’s listed here, and nothing is synced. Berry only reads a page when you ask, and only speaks up about work you started.",
    Body: WhatLeaves,
  },
  "site-permissions": {
    about: "When a site asks for your camera, location or similar, your answer shows up here.",
    Body: SitePermissionsSettings,
  },
  "bring-in-history": { Body: BringInHistory },
  "ai-service": {
    about: (
      <>
        Berry thinks with an AI service, using a key that’s yours, and you pay the service for what it uses.{" "}
        <More text="The key is kept encrypted on this computer and only ever goes to the service. Settings shows only its last four characters." />
      </>
    ),
    Body: AiService,
  },
  phone: {
    about: (
      <>
        When a job needs you and you’re away, your own Telegram bot asks you, and your reply goes straight to the job.{" "}
        <More text="It runs from this computer, so it only works while Blueberry is open." />
      </>
    ),
    Body: PhoneSettings,
  },
  claude: { about: "Claude Code and Claude Desktop on this computer can give your mascots jobs.", Body: McpSettings },
  cloud: {
    about: (
      <>
        A mascot can do a job in a browser on Browserbase instead of in your tabs here, signed in only to the sites you bring along.{" "}
        <More text="You watch it live in a cloud tab and can take over there, and it asks you before anything risky, the same as here." />
      </>
    ),
    Body: CloudSettings,
  },
};

export const SettingsPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
  const { section, page } = settingsPlace(tab.pageParam) ?? { section: "general" as const, page: null };
  const Section = SECTIONS[section];
  const stepIn = page && STEP_IN[page];

  return (
    <PageFrame>
      {page && stepIn ? (
        <section aria-label={PAGE_TITLES[page]}>
          <StepInHeader back={SECTION_NAMES[section]} onBack={() => openSettings(section)} title={PAGE_TITLES[page]}>
            {stepIn.about}
          </StepInHeader>
          <stepIn.Body />
        </section>
      ) : (
        <>
          <PageHeader title="Settings" />
          <SegmentSwitch
            label="Settings sections"
            items={SETTINGS_SECTIONS.map((value) => ({ value, label: SECTION_NAMES[value] }))}
            current={section}
            onChange={openSettings}
            className="mt-3.5 h-8 rounded-[11px] [&>button]:rounded-[9px] text-13"
          />
          <section role="tabpanel" aria-label={SECTION_NAMES[section]}>
            <Section />
          </section>
        </>
      )}
    </PageFrame>
  );
};
