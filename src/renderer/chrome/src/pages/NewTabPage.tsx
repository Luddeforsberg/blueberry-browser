import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { TabInfo, Visit } from "@shared/ipc";
import type { MascotProfile, NeedsYouItem, Suggestion } from "@shared/library";
import { BERRY_ID, permissionsInWords } from "@shared/mascots";
import { firstJobRows, PLAIN_WORDS, type FirstJob } from "@shared/firstRun";
import { greetingName } from "@shared/accountName";
import { Button } from "@common/components/Button";
import { cn } from "@common/lib/utils";
import { LABEL } from "@common/components/StatusPill";
import { looksLikeUrl, toUrl } from "@common/lib/url";
import { useMascots, useLibrary } from "../contexts/useLibrary";
import { useShell } from "../contexts/useShell";
import { Berry } from "../components/Berry";
import { useAssistantName } from "../components/useAssistantName";
import { Composer } from "../components/Composer";
import { useCloud } from "../useCloud";
import { useRunner } from "../useRunner";
import { startMascot, suggestedMascot } from "../mascotsView";
import { openRoutines, startRoutine, suggestedForm } from "../routinesView";
import { asContinuation, withSiteNames } from "../siteNames";
import { SuggestionItem } from "../components/SuggestionItem";
import { suggestionRows, type SuggestionRow } from "../newTabSuggestions";
import { useAttachments } from "../useAttachments";
import { BoxChips } from "../components/BoxAttachments";
import { useAddMenu } from "../components/useAddMenu";
import { useRecording } from "../components/useRecording";
import { Favicon } from "../components/Favicon";
import { startingSites } from "../startingSites";
import { FIRST_JOB_PROMPT, FirstJobs } from "../components/FirstJobs";
import { setGalleryView } from "../galleryView";
import { galleryParam } from "@shared/galleryPlaces";
import { openSettings } from "../openSettings";
import { useMascotSwitch } from "./useMascotSwitch";

// DESIGN.md section 10, New tab: no page yet, so no sheet. The well, the greeting, the prompt box, and what's real under it.

// The well's dot grid, which never sits behind text: it fades out in a round towards the middle, wide enough to clear the
// box and the lists, so it shows in the corners and softly along the edges.
const WELL_DOTS = (
  <div
    aria-hidden
    className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,var(--dot)_1px,transparent_1.3px)] bg-[length:14px_14px] [mask-image:radial-gradient(ellipse_66%_84%_at_50%_54%,transparent_0,transparent_48%,#000_86%)]"
  />
);

// DESIGN.md section 10, Show Berry how: started from one of our own pages, which aren't watched, a new tab says what to
// do while watching is on, in place of the greeting, the box and the lists, so nothing on it offers to ask anything.
// Going somewhere from it is going there from the address field, and this tab becomes the page the job starts on.
const ShowMeHow: React.FC<{ tab: TabInfo }> = ({ tab }) => {
  const [text, setText] = useState("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const { pinned } = useLibrary();
  const isBerry = useAssistantName() !== "Assistant";
  useEffect(() => {
    void window.chromeAPI.browser.searchHistory({}).then(({ entries }) => setVisits(entries));
  }, []);
  const go = (url: string) => void window.chromeAPI.browser.navigateTab(tab.id, url);
  const sites = startingSites(pinned, visits);

  return (
    <div className="relative h-full">
      {WELL_DOTS}
      <div className="absolute inset-0 overflow-y-auto [container-type:size]">
        <div className="min-h-full flex flex-col items-center px-6 pt-[max(48px,calc(43cqh-150px))] pb-12 text-center">
          <Berry mood="curious" size={56} />
          <h1 className="mt-3 text-20 font-semibold text-ink">{isBerry ? "Show me how." : "Record a routine."}</h1>
          <p className="mt-2 max-w-[400px] text-14 text-ink-2">
            {isBerry
              ? "Go to where the job starts and do it once. I note what you click and type as steps, and never a password."
              : "Go to where the job starts and do it once. What you click and type is noted as steps, never a password."}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) go(toUrl(text));
            }}
            className="mt-4 w-full max-w-[420px] h-11 px-3.5 flex items-center gap-2.5 rounded-[14px] bg-sheet shadow-chip text-left focus-within:ring-2 focus-within:ring-focus"
          >
            <Search aria-hidden className="size-[15px] shrink-0 text-ink-3" strokeWidth={1.75} />
            <input
              aria-label="Where does it start?"
              placeholder="Where does it start?"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              autoFocus
              className="flex-1 min-w-0 h-full bg-transparent text-15 text-ink caret-ink outline-none placeholder:text-faint"
            />
          </form>
          {sites.length > 0 && (
            <ul aria-label="Places to start" className="mt-3 flex flex-wrap justify-center gap-2">
              {sites.map(({ site, url, favicon }) => (
                <li key={site}>
                  <Button variant="raised" size="sm" className="text-13" onClick={() => go(url)}>
                    <Favicon src={favicon} site={site} />
                    {site}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-13 text-ink-3">Or go to a tab you already have open.</p>
        </div>
      </div>
    </div>
  );
};

// What a mascot may not do, in words, or nothing for one with no limits, as Berry has none.
const limitsOf = (mascot: MascotProfile): string | null => {
  const lines = permissionsInWords(mascot);
  return lines.every((line) => line.open) ? null : lines.map((line) => `${line.text}.`).join(" ");
};

const openJob = (item: Pick<NeedsYouItem, "id" | "job" | "routineId">) => {
  if (item.routineId) {
    openRoutines({ page: "routine", id: item.routineId });
  } else {
    void window.chromeAPI.browser.openPage("chat", { param: item.id, title: item.job });
  }
};

const Label: React.FC<{ ask?: boolean; id: string; children: React.ReactNode }> = ({ ask, id, children }) => (
  <h2 id={id} className={cn("mx-3 mb-1.5", LABEL, ask && "text-ask")}>
    {children}
  </h2>
);

const WaitingRow: React.FC<{ item: NeedsYouItem }> = ({ item }) => {
  const mascot = useMascots().find(item.mascotId);
  const name = useAssistantName(mascot);
  const { approval } = item;
  // An approval says what it would do, so it reads on from the mascot's name. A question or a handoff is already a sentence.
  const words = withSiteNames(approval.text);
  return (
    <li className="min-h-12 py-2 pl-3 pr-2.5 flex items-center gap-[13px] rounded-[14px] bg-sheet text-14 text-ink shadow-chip">
      <Berry mood="asking" size={26} mascot={mascot} />
      <span className="flex-1 min-w-0 truncate">
        {approval.question || approval.handoff ? (
          words
        ) : (
          <>
            <span className="font-medium">{name}</span> wants to {asContinuation(words)}
          </>
        )}
        <span className="text-ink-2">, on {item.job}</span>
      </span>
      {/* A row in a list never carries a filled button. */}
      <Button size="sm" variant="raised" onClick={() => openJob(item)} aria-label={`Review ${item.job}`}>
        Review
      </Button>
    </li>
  );
};

export const NewTabPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // What a row put in the box, and which row: moves the keyboard there, and the row looks used while the box still says it.
  // A suggestion's id is told when it's sent.
  const [filled, setFilled] = useState<{ key: string; suggestionId: string | null; prompt: string; times: number } | null>(null);
  const fill = (key: string, suggestionId: string | null, prompt: string) => {
    setText(prompt);
    setFilled({ key, suggestionId, prompt, times: (filled?.times ?? 0) + 1 });
  };
  const browser = window.chromeAPI.browser;
  const library = useLibrary();
  const { settings } = useShell();
  const { chosen, choose, mascots } = useMascots();
  // Who was chosen as the page opened, so choosing one from a row doesn't reorder the rows.
  const [chosenAtOpen] = useState(chosen.id);
  const { shown, face, switching, still } = useMascotSwitch(chosen);
  const [cloudState] = useCloud();
  // Only with a runner linked in Settings > Cloud, which has accepted, so nothing waits in a queue nobody takes from.
  const [runnerState] = useRunner();
  const canUseRunner = runnerState.status === "linked";
  const canUseCloud = cloudState.status !== "off";
  // Null follows the mascot, which may work in the cloud. Choosing another goes back to following it.
  const [cloudChoice, setCloudChoice] = useState<boolean | null>(null);
  useEffect(() => setCloudChoice(null), [chosen.id]);
  // One that only reads the page in front has no use for the cloud, where that page isn't.
  const cloudFits = (canUseRunner || canUseCloud) && chosen.tools.includes("visit");
  const inCloud = cloudFits && (cloudChoice ?? chosen.worksInCloud === true);
  // The runner keeps going with this computer off, so it's used whenever there is one. The user never picks.
  const toRunner = inCloud && canUseRunner;
  const box = useAttachments(toRunner ? "runner" : inCloud ? "cloud" : "here");
  const recording = useRecording().status === "recording";
  const assistant = useAssistantName();
  const add = useAddMenu(box, {
    chatId: null,
    mascot: chosen,
    place: toRunner ? "runner" : inCloud ? "cloud" : "here",
    // Show Berry how starts here too, for a routine shown rather than written.
    showHow: {
      label: assistant === "Assistant" ? "Record a routine" : `Show ${assistant} how`,
      note: assistant === "Assistant" ? null : "makes a routine",
      problem: recording ? "It’s already watching" : null,
      onStart: () => void window.chromeAPI.recording.start(),
    },
  });

  // Saved cards, at once. New ones arrive when they're written, and the page never waits for them.
  useEffect(() => {
    const { list, onUpdated } = window.chromeAPI.suggestions;
    void list().then(setSuggestions);
    return onUpdated(setSuggestions);
  }, []);

  // Examples from the starters' real runs, for the mascots to try.
  const [examples, setExamples] = useState<Record<string, string>>({});
  useEffect(() => {
    void window.chromeAPI.mascots.examples().then(setExamples);
  }, []);

  const takeUp = (suggestion: Suggestion) => {
    if (suggestion.kind === "prompt") {
      fill(`suggestion-${suggestion.id}`, suggestion.id, suggestion.prompt);
    } else if (suggestion.kind === "routine") {
      startRoutine(suggestedForm(suggestion.draft, suggestion.id));
    } else {
      startMascot(suggestedMascot(suggestion.draft, suggestion.id));
    }
  };

  const dismiss = (id: string) => void window.chromeAPI.suggestions.dismiss(id).then(setSuggestions);

  const press = (row: SuggestionRow) => {
    if (row.kind === "pick-up") openJob({ id: row.chat.id, job: row.chat.title, routineId: null });
    else if (row.kind === "suggestion") takeUp(row.suggestion);
    else {
      choose(row.mascot.id);
      fill(row.key, null, row.prompt);
    }
  };

  // First jobs, after the first run, in place of suggestions until every row is done or it's hidden.
  const firstJobsShown = firstJobRows(settings.firstJobs, settings.firstJobsDone).length > 0;
  const greeting = greetingName(settings.accountName);
  const pressFirstJob = (job: FirstJob) => {
    if (job === "key") openSettings("ai-service");
    else if (job === "history") openSettings("bring-in-history");
    else if (job === "try") {
      // Its words are Berry's to act on. Nothing is sent until the user sends it.
      choose(BERRY_ID);
      fill("first-job-try", null, FIRST_JOB_PROMPT);
    } else {
      setGalleryView({ query: "", category: null });
      void browser.openPage("mascot-gallery", { param: galleryParam({ page: "mascot", id: PLAIN_WORDS }) });
    }
  };

  const ask = async (message: string) => {
    if (filled?.suggestionId) void window.chromeAPI.suggestions.used(filled.suggestionId);
    const chat = await window.chromeAPI.chat.send(null, message, {
      seePage: false,
      mascotId: chosen.id,
      runner: toRunner,
      cloud: inCloud && !canUseRunner && canUseCloud,
      ...box.sendable(),
    });
    if (!chat) return;
    box.clear();
    await browser.openPage("chat", { param: chat.id, title: chat.title });
    await browser.closeTab(tab.id);
  };

  // Enter opens anything that looks like an address and asks the mascot about everything else. ⌘Enter always asks, and
  // so does anything with something attached, which is for the mascot.
  const submit = (alwaysAsk: boolean) => {
    const message = text.trim();
    if (!message) return;
    if (alwaysAsk || !box.empty || !looksLikeUrl(message)) void ask(message);
    else void browser.navigateTab(tab.id, toUrl(message));
  };

  const name = useAssistantName(shown);
  const asking = new Set(library.needsYou.map(({ id }) => id));
  const rows = suggestionRows({ chats: library.chats, asking, suggestions, mascots, examples, chosenAtOpen });

  if (recording) return <ShowMeHow tab={tab} />;

  return (
    <div className="relative h-full">
      {WELL_DOTS}
      {/* Placed by the page area's own height, not the window's: the box's middle at 43% of it, and the greeting
                never nearer the top than 48px. 127px is from the greeting's top to the middle of the empty box. The lists
                flow on under it. */}
      <div className="absolute inset-0 overflow-y-auto [container-type:size]">
        <div className="min-h-full flex flex-col items-center px-6 pt-[max(48px,calc(43cqh-127px))] pb-12">
          {/* A mark, not a control. */}
          <h1 className="max-w-[640px] mb-[26px] flex items-center gap-3 text-30 font-medium text-ink">
            <span data-berry-perched className="-mt-1.5 shrink-0 flex">
              <span
                key={face.arrival}
                className={cn(
                  "flex origin-[50%_70%]",
                  face.arrival > 0 && (still ? "animate-[mascot-fade_150ms_ease-out]" : "animate-mascot-pop"),
                )}
              >
                <Berry size={40} mascot={shown} mood={face.mood} shut={face.shut} />
              </span>
            </span>
            {/* A long name is cut, never wrapped, at the box's width. Cutting clips at the line box, which is
                            shorter than a g or a comma hangs, so the box is given room it doesn't take up. */}
            <span className="min-w-0 truncate py-1.5 -my-1.5">{greeting ? `Where to, ${greeting}?` : "Where to?"}</span>
          </h1>

          <div className="w-full max-w-[640px]">
            <Composer
              size="hero"
              label={`Search, enter a URL, or ask ${name === "Assistant" ? "a question" : name}`}
              placeholder={`Ask ${name}, or type an address`}
              quietPlaceholder={switching && face.shut}
              value={text}
              onChange={(next) => {
                setText(next);
                // Emptied, it's no longer that prompt being sent.
                if (!next.trim()) setFilled(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                submit(event.metaKey || event.ctrlKey);
              }}
              spellCheck={false}
              autoFocus
              focusKey={filled?.times}
              canSend={text.trim().length > 0}
              onSend={() => submit(false)}
              mascot={shown}
              chosenId={chosen.id}
              face={face}
              onChooseMascot={choose}
              limits={limitsOf(shown)}
              cloud={cloudFits ? { on: inCloud, onToggle: () => setCloudChoice(!inCloud) } : undefined}
              attachment={box.empty ? undefined : <BoxChips box={box} />}
              add={add}
              onFiles={toRunner ? undefined : (files) => void box.addFiles(files)}
            />
          </div>

          <div className="w-full max-w-[640px] mt-[26px] flex flex-col gap-4">
            {library.needsYou.length > 0 && (
              <section aria-labelledby="new-tab-waiting">
                <Label ask id="new-tab-waiting">
                  Waiting for you
                </Label>
                <ul className="flex flex-col gap-1.5">
                  {library.needsYou.map((item) => (
                    <WaitingRow key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            )}
            {firstJobsShown ? (
              <FirstJobs onPress={pressFirstJob} />
            ) : (
              rows.length > 0 && (
                <section aria-labelledby="new-tab-suggestions">
                  <Label id="new-tab-suggestions">Suggestions</Label>
                  <ul className="flex flex-col gap-0.5">
                    {rows.map((row) => (
                      <SuggestionItem
                        key={row.key}
                        row={row}
                        used={filled?.key === row.key && text === filled.prompt}
                        onPress={() => press(row)}
                        onDismiss={row.kind === "suggestion" ? () => dismiss(row.suggestion.id) : undefined}
                      />
                    ))}
                  </ul>
                </section>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
