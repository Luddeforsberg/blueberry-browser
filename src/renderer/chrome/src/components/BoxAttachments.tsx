import React from "react";
import type { AttachmentBox } from "../useAttachments";
import { ChipRow, FileChip, TabChip } from "./AttachmentChips";

// The + menu and the chips for one prompt box, the same in all three: the new tab, the main chat and the chat panel.

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
