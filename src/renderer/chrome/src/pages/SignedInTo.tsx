import React, { useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { CloudLogin, CloudState } from "@shared/ipc";
import { Button } from "@common/components/Button";
import { cn } from "@common/lib/utils";
import { LINE_BETWEEN, ROW } from "../components/pageRows";
import { SettingsGroup, SettingsRow } from "../components/SettingsRow";
import { FIELD } from "./cloudField";
import { useFromMain } from "@common/lib/latest";

// Part of Settings > Cloud (CloudSettings.tsx): the sites signed in to there.

const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });

const loginStatus = (login: CloudLogin): string => {
  if (login.status === "checked") return `Checked by you, ${day(login.checkedAt ?? login.addedAt)}`;
  if (login.status === "signed-out") return `Signed out when you checked, ${day(login.checkedAt ?? login.addedAt)}`;
  return `Brought over ${day(login.addedAt)}, not checked yet`;
};

// Sites whose sign-in the user brought into the cloud browser. Only names and dates reach this page, never a cookie, and
// only the user can start any of it: each site asks for Touch ID first.
export const SignedInTo: React.FC<{ cloud: CloudState }> = ({ cloud }) => {
  const api = window.chromeAPI.cloud;
  const [site, setSite] = useState("");
  const sites = cloud.logins.map((login) => login.site).join(" ");
  const [suggestions] = useFromMain<string[]>([], api.loginSuggestions, undefined, sites);
  const [working, setWorking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  const run = async (what: string, act: () => Promise<string | null>) => {
    setWorking(what);
    setProblem(null);
    const said = await act();
    setWorking(null);
    setProblem(said);
    return said;
  };
  const bring = async (choice: string) => {
    const said = await run(choice, () => api.bringLogin(choice));
    if (!said) setSite("");
  };

  return (
    <SettingsGroup
      label="signed in to"
      trailing={
        <button
          type="button"
          onClick={() => field.current?.focus()}
          className="h-[22px] -mr-1 px-1.5 flex items-center gap-1 rounded-[7px] font-sans text-13 normal-case text-ink-2 hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Plus aria-hidden className="size-[13px]" strokeWidth={1.75} />
          Add a site
        </button>
      }
    >
      {cloud.logins.length > 0 && (
        <ul aria-label="Sites signed in in the cloud">
          {cloud.logins.map((login) => (
            <li key={login.site} className={cn(ROW, LINE_BETWEEN, "before:left-2 min-h-12 py-[9px] flex items-center gap-3")}>
              <div className="flex-1 min-w-0">
                <p className="text-14 truncate">{login.site}</p>
                <p className={login.status === "signed-out" ? "mt-0.5 text-13 text-ask" : "mt-0.5 text-13 text-ink-2"}>
                  {loginStatus(login)}
                </p>
              </div>
              <Button
                size="sm"
                variant="raised"
                disabled={working !== null}
                onClick={() => void run(login.site, () => api.checkLogin(login.site))}
              >
                Check
              </Button>
              <Button
                size="sm"
                variant="raised"
                disabled={working !== null}
                onClick={() => void run(login.site, () => api.revokeLogin(login.site))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <SettingsRow
        id="setting-cloud-logins"
        title={cloud.logins.length > 0 ? "Another site" : "Bring a site along"}
        description="Bring your sign-in to a site along, and a mascot in the cloud can use it as you."
        more="Only that site’s cookies are copied, after Touch ID, and they stay in the cloud browser. Nothing else from this browser goes there."
        below={
          <>
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (site.trim()) void bring(site.trim());
              }}
            >
              <input
                ref={field}
                aria-label="Site to bring along"
                spellCheck={false}
                autoComplete="off"
                value={site}
                onChange={(event) => setSite(event.target.value)}
                placeholder="A site, such as github.com"
                className={`flex-1 ${FIELD}`}
              />
              <Button type="submit" disabled={working !== null || !site.trim()}>
                {working === site.trim() && site.trim() ? "Bringing…" : "Bring along"}
              </Button>
            </form>

            {suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-14 text-ink-2">From your history:</span>
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    size="xs"
                    variant="raised"
                    disabled={working !== null}
                    aria-label={`Bring along ${suggestion}`}
                    onClick={() => void bring(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}

            {problem && (
              <p role="alert" className="mt-3 text-14 text-ask">
                {problem}
              </p>
            )}
          </>
        }
      />

      {cloud.logins.length > 0 && (
        <SettingsRow id="setting-cloud-forget-logins" title="Every site above" description="Takes their sign-ins out of the cloud browser.">
          <Button variant="raised" size="sm" disabled={working !== null} onClick={() => void run("all", () => api.forgetLogins())}>
            Forget all cloud logins
          </Button>
        </SettingsRow>
      )}
    </SettingsGroup>
  );
};
