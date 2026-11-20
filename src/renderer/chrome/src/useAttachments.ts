import { useCallback, useEffect, useRef, useState } from "react";
import { ATTACHMENT_WORDS, type FileChip, type TabChoice } from "@shared/attachments";
import { useBrowser } from "./contexts/useBrowser";
import { FileStaging } from "./fileStaging";

// What a prompt box has been given to read. Main decides what each file is and whether it may go, and decides again as
// the message goes: this only keeps the chips and says, for the place the job will run, what can't go along.

// Where the job runs: here, in a cloud tab whose model is still called from here, or on the runner with this computer off.
export type JobPlace = "here" | "cloud" | "runner";

export interface Attached {
  files: string[];
  tabs: string[];
}

export const useAttachments = (place: JobPlace) => {
  const [files, setFiles] = useState<FileChip[]>([]);
  const [staging] = useState(() => new FileStaging(window.chromeAPI.attachments, setFiles));
  const [tabs, setTabs] = useState<TabChoice[]>([]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const { tabs: open } = useBrowser();

  // A tab that closed simply goes from the box.
  useEffect(() => {
    setTabs((current) => {
      const still = current.filter((tab) => open.some(({ id }) => id === tab.id));
      return still.length === current.length ? current : still;
    });
  }, [open]);

  // Anything main keeps for this box is let go of there when the box goes, including what an add still out brings.
  useEffect(() => {
    staging.start();
    return () => staging.close();
  }, [staging]);

  const chooseFiles = useCallback(() => staging.choose(), [staging]);
  // A drop or a paste.
  const addFiles = useCallback((list: File[]) => staging.drop(list), [staging]);

  const addTab = useCallback((tab: TabChoice) => {
    setTabs((current) => (current.some(({ id }) => id === tab.id) ? current : [...current, tab]));
  }, []);

  const remove = useCallback(
    (id: string) => {
      setTabs((current) => current.filter((tab) => tab.id !== id));
      staging.remove(id);
    },
    [staging],
  );

  const adding = useCallback(() => staging.adding(), [staging]);

  // Everything in the box now, to let go of once main has taken the message it's sent with.
  const contents = useCallback((): string[] => [...staging.files.map(({ id }) => id), ...tabsRef.current.map(({ id }) => id)], [staging]);

  // Main has taken the message these were in the box for. What went is main's, what didn't go goes with it, as its
  // chip does, and anything added since stays.
  const letGo = useCallback(
    (ids: readonly string[]) => {
      setTabs((current) => current.filter((tab) => !ids.includes(tab.id)));
      staging.letGo(ids);
    },
    [staging],
  );

  // The tab chips again, for a mascot chosen since: one it may not have says why.
  const recheckTabs = useCallback((choices: TabChoice[], missing: (tab: TabChoice) => string | null) => {
    setTabs((current) =>
      current.map((tab) => {
        const listed = choices.find(({ id }) => id === tab.id);
        return { ...tab, problem: listed ? listed.problem : missing(tab) };
      }),
    );
  }, []);

  const fileProblem = (file: FileChip) => file.problem ?? (place === "runner" ? ATTACHMENT_WORDS.fileToCloud : null);
  const tabProblem = (tab: TabChoice) => (place !== "here" ? ATTACHMENT_WORDS.tabToCloud : tab.problem);

  // What goes with the message: everything that has no reason not to.
  const sendable = (): Attached => ({
    files: files.filter((file) => !fileProblem(file)).map((file) => file.id),
    tabs: tabs.filter((tab) => !tabProblem(tab)).map((tab) => tab.id),
  });

  return {
    files,
    tabs,
    chooseFiles,
    addFiles,
    addTab,
    remove,
    adding,
    contents,
    letGo,
    recheckTabs,
    fileProblem,
    tabProblem,
    sendable,
    empty: files.length === 0 && tabs.length === 0,
  };
};

export type AttachmentBox = ReturnType<typeof useAttachments>;
