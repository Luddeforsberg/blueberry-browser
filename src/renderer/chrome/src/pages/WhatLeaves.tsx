import React from "react";
import { StatusPill } from "@common/components/StatusPill";
import { useShell } from "../contexts/useShell";
import { SettingsGroup, SettingsLink, SettingsRow } from "../components/SettingsRow";
import { openMascots } from "../mascotsView";

// Settings > Privacy > What leaves this computer: everything Settings says about what goes where, in one place. It only
// says. The switches are in Mascots. The longer words have to match `buildDigest` in suggestionDigest.ts and
// `proposalData` in Chats.ts.

const SUGGESTIONS_DETAIL =
  "The summary has site names and page titles in the order you visited them, what you searched for, the titles of your chats and routines and how they went, and which cards you dismissed or used. Never page text or full addresses. Local addresses, addresses with tokens, sites it recognises as banks or mail, and searches about health, money or logins are left out, though it can miss one. Off means nothing is sent.";
const MEMORY_DETAIL =
  "To word the offer, what you typed in that chat or routine and the names of the sites it used go to the AI service, never page text or the reply. Nothing is kept unless you press Remember, and each mascot’s page in Your mascots shows all it has. Off means no more offers, and what’s kept stays in use until you forget it there.";

const State: React.FC<{ on: boolean; children: string }> = ({ on, children }) => (
  <StatusPill tone={on ? "on" : "off"}>{children}</StatusPill>
);

export const WhatLeaves: React.FC = () => {
  const { settings } = useShell();
  return (
    <>
      <SettingsGroup label="Goes to the AI service">
        <SettingsRow
          id="leaves-messages"
          title="Your messages"
          description="With the page you ask about, as text and a picture."
          more="Messages in the chat panel include the open page’s text and a screenshot, which go to the AI service to answer them."
        >
          <State on>Always</State>
        </SettingsRow>
        <SettingsRow
          id="leaves-attached"
          title="Tabs and files you attach"
          description="With the message you attach them to. A file goes again with each later message in that chat."
          more="A tab’s text and a picture of it go with that one message. A file’s contents are kept with its chat on this computer, so you can ask more about it, and are deleted with the chat. Nothing you attach goes to a job that runs with this computer off."
        >
          <State on>When added</State>
        </SettingsRow>
        <SettingsRow
          id="leaves-routines"
          title="What a routine is told to do"
          description="When you save it, to give it a name, and each time it runs."
        >
          <State on>Always</State>
        </SettingsRow>
        <SettingsRow
          id="leaves-suggestions"
          title="Suggestions"
          description="Site names, page titles and searches from the last two weeks. Never page text."
          more={SUGGESTIONS_DETAIL}
        >
          <State on={settings.suggestions}>{settings.suggestions ? "On" : "Off"}</State>
        </SettingsRow>
        <SettingsRow
          id="leaves-memory"
          title="Offers to remember"
          description="What you typed in that chat and the names of the sites."
          more={MEMORY_DETAIL}
        >
          <State on={settings.memoryOffers}>{settings.memoryOffers ? "On" : "Off"}</State>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup label="Only when you start it">
        <SettingsRow
          id="leaves-publishing"
          title="Publishing a mascot"
          description="Only a mascot you choose to publish goes public, and you see exactly what goes first."
        />
        <SettingsRow
          id="leaves-cloud"
          title="A cloud job"
          description="Its pages load in Browserbase’s browser, not yours, signed in only to the sites you bring along."
        />
        <SettingsRow
          id="leaves-phone"
          title="Answering from your phone"
          description="Telegram sees what the job asks you, the site and any code you send. Passwords are never sent this way."
        />
      </SettingsGroup>
      <SettingsGroup label="Stays here">
        <SettingsRow
          id="leaves-local"
          title="History, chats, bookmarks, open tabs and settings"
          description="Open tabs only while Blueberry opens your tabs, and your history apart from what Suggestions sends, if it’s on."
        />
        <SettingsLink title="What your mascots remember" value="Your mascots" onOpen={() => openMascots({ page: "list" })} />
      </SettingsGroup>
    </>
  );
};
