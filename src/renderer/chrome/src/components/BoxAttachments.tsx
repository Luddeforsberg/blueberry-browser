import React, { useEffect } from "react";
import type { MascotProfile } from "@shared/library";
import { ATTACHMENT_WORDS } from "@shared/attachments";
import { permissionsInWords, siteAllowed } from "@shared/mascots";
import type { AttachmentBox, JobPlace } from "../useAttachments";
import type { AddMenuOptions } from "./AddMenu";
import { ChipRow, FileChip, TabChip } from "./AttachmentChips";

// The + menu and the chips for one prompt box, the same in all three: the new tab, the main chat and the chat panel.

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
  useEffect(() => {
    if (tabCount === 0) return;
    let live = true;
    void window.chromeAPI.attachments
      .tabs(chatId, mascot.id)
      .then((choices) => live && box.recheckTabs(choices, (tab) => (siteAllowed(`https://${tab.site}`, mascot.sites) ? null : note)));
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

// The chips at the top of the card, after anything the box shows first, such as the page in front.
export const BoxChips: React.FC<{ box: AttachmentBox; before?: React.ReactNode }> = ({ box, before }) => {
  if (box.empty && !before) return null;
  return (
    <ChipRow>
      {before}
      {box.tabs.map((tab) => (
        <TabChip key={tab.id} tab={tab} problem={box.tabProblem(tab)} onRemove={() => box.remove(tab.id)} />
      ))}
      {box.files.map((file) => (
        <FileChip key={file.id} file={file} problem={box.fileProblem(file)} onRemove={() => box.remove(file.id)} />
      ))}
    </ChipRow>
  );
};
