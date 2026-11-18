import { useEffect, useRef } from "react";
import type { MascotProfile } from "@shared/library";
import { ATTACHMENT_WORDS, type TabChoice } from "@shared/attachments";
import { permissionsInWords, siteAllowed } from "@shared/mascots";
import type { AttachmentBox, JobPlace } from "../useAttachments";
import type { AddMenuOptions } from "./AddMenu";

// What limits the tabs a mascot is offered, in `permissionsInWords`'s own words, or nothing for one that may read any.
const sitesNote = (mascot: MascotProfile): string | null => {
  if (mascot.sites.length === 0) return null;
  const [where] = permissionsInWords(mascot);
  return `${mascot.name} ${where.text.charAt(0).toLowerCase()}${where.text.slice(1)}`;
};

export const useAddMenu = (
  box: AttachmentBox,
  {
    chatId,
    mascot,
    place,
    thisPage,
    showHow,
  }: { chatId: string | null; mascot: MascotProfile; place: JobPlace } & Pick<AddMenuOptions, "thisPage" | "showHow">,
): AddMenuOptions => {
  // Choosing another mascot can rule out a tab already in the box. Main says so again as the message goes.
  const note = sitesNote(mascot);
  const tabCount = box.tabs.length;
  // The check as this render has it. The effect takes it as it starts, and runs again only for another chat, mascot or
  // number of tabs, not each time the library sends the same mascot anew.
  const recheck = (choices: TabChoice[]) =>
    box.recheckTabs(choices, (tab) => (siteAllowed(`https://${tab.site}`, mascot.sites) ? null : note));
  const latest = useRef(recheck);
  latest.current = recheck;
  useEffect(() => {
    if (tabCount === 0) return;
    const recheckTabs = latest.current;
    let live = true;
    void window.chromeAPI.attachments.tabs(chatId, mascot.id).then((choices) => live && recheckTabs(choices));
    return () => {
      live = false;
    };
  }, [chatId, mascot.id, tabCount]);

  return {
    thisPage,
    tabs: {
      problem: place === "here" ? null : ATTACHMENT_WORDS.tabToCloud,
      note,
      load: () => window.chromeAPI.attachments.tabs(chatId, mascot.id),
      added: box.tabs.map(({ id }) => id),
      onChoose: box.addTab,
    },
    files: { problem: place === "runner" ? ATTACHMENT_WORDS.fileToCloud : null, onChoose: () => void box.chooseFiles() },
    showHow,
  };
};
