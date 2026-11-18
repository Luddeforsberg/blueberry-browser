import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { SavedSitePermission, SiteDecision } from "@shared/ipc";
import { Button } from "@common/components/Button";
import { Choice, Switch } from "@common/components/Controls";
import { ASKS_EVERY_TIME, SITE_PERMISSION_WORDS, siteName } from "@common/lib/sitePermissions";
import { SettingsGroup, SettingsRow } from "../components/SettingsRow";
import { ToolBarButton } from "../components/ToolBarButton";
import { useShell } from "../contexts/ShellContext";

export const DownloadSettings: React.FC = () => {
  const { settings, updateSettings } = useShell();

  return (
    <>
      <SettingsRow id="setting-download-folder" title="Save files to" description={settings.downloadFolder ?? undefined}>
        <div className="shrink-0 flex items-center gap-2">
          {settings.downloadFolder ? (
            <Button size="sm" variant="ghost" onClick={() => updateSettings({ downloadFolder: null })}>
              Use Downloads
            </Button>
          ) : (
            <span className="text-13 text-ink-2">Your Downloads folder</span>
          )}
          <Button size="sm" variant="raised" onClick={() => void window.chromeAPI.downloads.chooseFolder()}>
            Change…
          </Button>
        </div>
      </SettingsRow>
      <SettingsRow id="setting-ask-where" title="Ask where to save each file" description="Off saves straight to the folder above.">
        <Switch
          labelledBy="setting-ask-where"
          checked={settings.askWhereToSave}
          onChange={(askWhereToSave) => updateSettings({ askWhereToSave })}
        />
      </SettingsRow>
    </>
  );
};

// Every answer a site has saved, kept up to date.
export const useSitePermissions = () => {
  const [saved, setSaved] = useState<SavedSitePermission[]>([]);
  useEffect(() => {
    void window.chromeAPI.permissions.saved().then(setSaved);
    return window.chromeAPI.permissions.onSavedUpdated(setSaved);
  }, []);
  return saved;
};

export const SitePermissionsSettings: React.FC = () => {
  const saved = useSitePermissions();

  if (saved.length === 0) {
    return (
      <SettingsGroup>
        <SettingsRow id="setting-sites-empty" title="No saved answers" description="A site you answer will be listed here." />
      </SettingsGroup>
    );
  }

  return (
    <>
      <SettingsGroup>
        {saved.map(({ origin, permission, decision }) => {
          const name = SITE_PERMISSION_WORDS[permission].name;
          const site = siteName(origin);
          return (
            <SettingsRow key={`${origin} ${permission}`} id={`setting-site-${origin}-${permission}`} title={site} description={name}>
              <div className="shrink-0 flex items-center gap-2">
                {ASKS_EVERY_TIME.includes(permission) ? (
                  <span className="text-14 text-ink-2">Blocked</span>
                ) : (
                  <Choice<SiteDecision>
                    label={`${name} for ${site}`}
                    value={decision}
                    onChange={(next) => void window.chromeAPI.permissions.set(origin, permission, next)}
                    options={[
                      { value: "allow", label: "Allow" },
                      { value: "block", label: "Block" },
                    ]}
                  />
                )}
                <ToolBarButton
                  Icon={X}
                  label={`Forget ${name} for ${site}`}
                  onClick={() => void window.chromeAPI.permissions.set(origin, permission, null)}
                />
              </div>
            </SettingsRow>
          );
        })}
      </SettingsGroup>
      <p className="px-2 mt-2.5 text-13 text-ink-2">
        A page already using something keeps it until you reload the page. Forgetting an answer makes the site ask again.
      </p>
    </>
  );
};
