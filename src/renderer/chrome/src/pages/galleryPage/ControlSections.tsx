import React from "react";
import { Button } from "@common/components/Button";
import { Choice, Switch } from "@common/components/Controls";
import { Cloud } from "lucide-react";
import { AccountButton, AccountMenu, Avatar } from "../../components/AccountMenu";
import { RowTile, SettingsGroup, SettingsLink, SettingsRow } from "../../components/SettingsRow";
import { SegmentSwitch } from "../../components/SegmentSwitch";
import { WindowPicture } from "../../components/WindowPicture";
import { Section } from "./Section";

// Buttons, controls, Settings and status words.
export const ControlSections: React.FC<{
  on: boolean;
  setOn: React.Dispatch<React.SetStateAction<boolean>>;
  choice: "one" | "two";
  setChoice: React.Dispatch<React.SetStateAction<"one" | "two">>;
  section: "one" | "two" | "three";
  setSection: React.Dispatch<React.SetStateAction<"one" | "two" | "three">>;
  picture: "light" | "dark" | "system";
  setPicture: React.Dispatch<React.SetStateAction<"light" | "dark" | "system">>;
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ on, setOn, choice, setChoice, section, setSection, picture, setPicture, menuOpen, setMenuOpen }) => (
  <>
    <Section title="Buttons">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Primary</Button>
        <Button variant="raised">Raised</Button>
        <Button variant="ghost" className="text-ink-2">
          Quiet
        </Button>
        <Button disabled>Disabled</Button>
      </div>
    </Section>

    <Section title="Controls">
      <div className="flex items-center gap-6">
        <Switch label="Example switch" checked={on} onChange={setOn} />
        <Choice
          label="Example choice"
          value={choice}
          onChange={setChoice}
          options={[
            { value: "one", label: "One" },
            { value: "two", label: "Two" },
          ]}
        />
      </div>
    </Section>

    <Section title="Settings">
      <div className="max-w-[620px]">
        <SegmentSwitch
          label="Example sections"
          items={[
            { value: "one", label: "One" },
            { value: "two", label: "Two" },
            { value: "three", label: "Three" },
          ]}
          current={section}
          onChange={setSection}
          className="h-8 rounded-[11px] [&>button]:rounded-[9px] text-13"
        />
        <SettingsGroup label="A group">
          <SettingsRow id="gallery-row-switch" title="A switch" description="One line on what it does." more="The rest, behind More.">
            <Switch labelledBy="gallery-row-switch" checked={on} onChange={setOn} />
          </SettingsRow>
          <SettingsRow id="gallery-row-pictures" title="Pictures" top>
            <Choice
              label="Pictures"
              value={picture}
              onChange={setPicture}
              options={[
                { value: "light", label: "Light", picture: <WindowPicture mode="light" /> },
                { value: "dark", label: "Dark", picture: <WindowPicture mode="dark" /> },
                { value: "system", label: "System", picture: <WindowPicture mode="system" /> },
              ]}
            />
          </SettingsRow>
          <SettingsRow id="gallery-row-avatar" lead={<Avatar name="Alex Lind" email={null} large />} title="A value and a button">
            <span className="text-13 text-ink-2">Alex Lind</span>
            <Button variant="raised" size="sm">
              Change
            </Button>
          </SettingsRow>
        </SettingsGroup>
        <SettingsGroup label="Rows that open something">
          <SettingsLink
            lead={
              <RowTile>
                <Cloud strokeWidth={1.75} />
              </RowTile>
            }
            title="With a state"
            description="And a line."
            state={{ words: "Connected", tone: "on" }}
            onOpen={() => undefined}
          />
          <SettingsLink
            lead={
              <RowTile>
                <Cloud strokeWidth={1.75} />
              </RowTile>
            }
            title="Not set up"
            description="A state and its next step."
            state={{ words: "Not set up" }}
            action={{ label: "Set up", onAct: () => undefined }}
            onOpen={() => undefined}
          />
          <SettingsLink
            lead={
              <RowTile>
                <Cloud strokeWidth={1.75} />
              </RowTile>
            }
            title="Needs you"
            description="What's wrong in a few words."
            state={{ words: "Session still open", tone: "ask" }}
            action={{ label: "Try again", onAct: () => undefined }}
            onOpen={() => undefined}
          />
          <SettingsLink title="With a value" value="3 sites" onOpen={() => undefined} />
        </SettingsGroup>
      </div>
      <div className="mt-6 flex items-end gap-6">
        <div className="relative w-[226px]">{menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} />}</div>
        <AccountButton open={menuOpen} onPress={() => setMenuOpen(!menuOpen)} />
        <AccountButton small open={false} onPress={() => setMenuOpen(!menuOpen)} />
      </div>
    </Section>

    <Section title="Status">
      <ul className="flex gap-6 text-14">
        <li className="text-ink">Running now</li>
        <li className="text-ink-2">Finished</li>
        <li className="text-ask">Needs your OK</li>
        <li className="text-ask">Failed</li>
      </ul>
    </Section>
  </>
);
