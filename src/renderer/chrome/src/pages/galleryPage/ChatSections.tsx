import type { RoutineFormValues } from "../../routinesView";
import React from "react";
import { AssistantMessage, ChatError, StepTrail, UserMessage, WentWrong } from "../../components/ChatMessage";
import { QueuedMessages } from "../../components/QueuedMessages";
import { ChatComposer } from "../../components/ChatComposer";
import { PageChip } from "../../components/AttachmentChips";
import { ChatRow } from "../../components/Sidebar";
import { StepCard } from "../../components/StepCard";
import { MascotMemoryView } from "../MascotMemory";
import { MemoryOffersLine, RememberedFacts } from "../../components/MemoryInChat";
import { BERRY } from "@shared/mascots";
import { REPLY_NOT_SAVED } from "@shared/library";
import { RoutineRunRow } from "../../components/RoutineRunRow";
import { ScheduleSentence, WhenAnswer } from "../RoutineSteps";
import { blankForm } from "../../routinesView";
import { WorkingStrip, WorkingView } from "../../components/WorkingView";
import { RecordingNotice, TrailNotes } from "../../components/ShowBerry";
import { Section } from "./Section";
import { SAMPLE_FACTS, SAMPLE_MASCOT, SAMPLE_RUNS, SAMPLE_FRAMES, SAMPLE_ASKING, WORK_SAMPLES } from "./gallerySamples";
import { missing } from "@shared/missing";

// A chat and what it shows: replies, Show Berry how, the working view, memory and routines.
export const ChatSections: React.FC<{
  routineForm: RoutineFormValues;
  setRoutineForm: React.Dispatch<React.SetStateAction<RoutineFormValues>>;
}> = ({ routineForm, setRoutineForm }) => (
  <>
    <Section title="Chat">
      <div className="max-w-xl flex flex-col gap-5">
        <UserMessage content="What did the Monday digest find?" />
        <QueuedMessages
          chatId="gallery"
          queued={[
            { id: "a", content: "Only braided ones, and under 100 kr" },
            { id: "b", content: "Then put it in my cart" },
          ]}
          running
          onEdit={() => undefined}
        />
        <AssistantMessage
          content="Two things changed: **flight prices** and the studio invoice."
          origin={{ words: "in the cloud", cloud: true }}
        />
        <AssistantMessage
          content=""
          isStreaming
          said={[
            { after: 0, text: "I'll check their careers page and LinkedIn first." },
            { after: 3, text: "They list two open roles so far." },
          ]}
          startedAt={Date.now() - 72_000}
          steps={[
            { text: "Opened strawberrybrowser.com/careers", done: true, kind: "open" },
            { text: "Read strawberrybrowser.com", done: true, kind: "read" },
            { text: "Read strawberrybrowser.com", done: true, kind: "read" },
            { text: "Clicked something on strawberrybrowser.com", done: true, kind: "click" },
            { text: "Typed into a field on strawberrybrowser.com", done: false, kind: "type" },
          ]}
        />
        <AssistantMessage content="" isStreaming waiting />
        <AssistantMessage content="" isStreaming />
        <AssistantMessage
          content="The cheapest direct flight is **KLM at 07:10**, 1 840 kr return."
          took={48_000}
          steps={[
            { text: "Opened klm.com", done: true, kind: "open" },
            { text: "Read klm.com", done: true, kind: "read" },
            { text: "Asked you something", done: true, kind: "ask" },
          ]}
          pages={[{ url: "https://www.klm.com/search", title: "Stockholm to Lisbon" }]}
          actions={{
            onSay: () => undefined,
            routineFromChat: () => blankForm("Flight price watch", "Find the cheapest flight to Lisbon"),
          }}
        />
        <AssistantMessage
          content=""
          steps={[
            { text: "Opened klm.com", done: true, kind: "open" },
            { text: "Read klm.com", done: true, kind: "read" },
            { text: "Stopped here", done: true },
          ]}
          actions={{ onSay: () => undefined }}
        />
        <AssistantMessage
          content=""
          error="Couldn't reach the model. Check your connection and try again."
          steps={[{ text: "Opened klm.com", done: true, kind: "open" }]}
          actions={{ onSay: () => undefined }}
        />
        <AssistantMessage
          content="Booked a table for two at 19:00 on Friday. The confirmation went to your email."
          error={REPLY_NOT_SAVED}
          steps={[{ text: "Opened thefork.com", done: true, kind: "open" }]}
          actions={{ onSay: () => undefined }}
        />
        <WentWrong message="Couldn't reach the model. Check your connection and try again." actions={{ onSay: () => undefined }} />
        <ChatError message="The model is rate limited right now. Try again in a moment." />
        <StepTrail
          steps={[
            { text: "Looked through your history for Lisbon", done: true },
            { text: "Opened norrskenair.com", done: true, kind: "open" },
            { text: "Comparing three weekends in November", done: false },
          ]}
        />
        <div>
          <ChatComposer onSend={async () => true} placeholder="Ask Berry" />
        </div>
        <ChatComposer
          onSend={async () => true}
          placeholder="With a page attached"
          attachment={<PageChip title="Jackdaw" host="en.wikipedia.org" onRemove={() => undefined} />}
        />
        <ChatComposer onSend={async () => true} placeholder="Disabled" disabled />
        <ChatComposer onSend={async () => true} onStop={() => undefined} placeholder="While replying" disabled />
      </div>
    </Section>

    <Section title="Show Berry how">
      <RecordingNotice state={{ status: "recording", startedAt: Date.now() - 42_000, steps: [], cut: null, error: null }} />
      <TrailNotes
        onRemove={() => {}}
        steps={[
          { id: "a", kind: "went", text: "Went to example.com", site: "example.com", path: "example.com/shop", label: "", value: "" },
          {
            id: "b",
            kind: "searched",
            text: "Searched for “usb-c cable” on example.com",
            site: "example.com",
            path: "example.com/search",
            label: "",
            value: "usb-c cable",
          },
          { id: "c", kind: "clicked", text: "Clicked Add to cart", site: "example.com", path: "", label: "Add to cart", value: "" },
          { id: "d", kind: "secret", text: "Typed in the password field", site: "example.com", path: "", label: "", value: "" },
        ]}
      />
    </Section>

    <Section title="Working view">
      <div className="flex flex-wrap items-start gap-8">
        {WORK_SAMPLES.map(({ label, view, asking }) => (
          <div key={label} className="w-[420px]">
            <div className="h-[420px] flex flex-col rounded-sheet bg-well">
              <WorkingView
                view={view}
                frames={SAMPLE_FRAMES}
                mascot={BERRY}
                approval={asking ? SAMPLE_ASKING : null}
                aspect={10 / 7}
                onHide={() => {}}
                onShowAsking={() => {}}
              />
            </div>
            <p className="mt-2 text-11 text-ink-2">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 w-[560px]">
        <WorkingStrip view={(WORK_SAMPLES[0] ?? missing("a working sample")).view} mascot={BERRY} approval={null} />
      </div>
    </Section>

    <Section title="Chat in the sidebar">
      <ul className="max-w-xs">
        <ChatRow
          chat={{ id: "gallery-1", title: "Long weekend in Lisbon", updatedAt: Date.now(), mascotId: null, from: null }}
          selected={false}
          onOpen={() => undefined}
        />
        <ChatRow
          chat={{ id: "gallery-2", title: "The open chat", updatedAt: Date.now(), mascotId: null, from: null }}
          selected
          onOpen={() => undefined}
        />
      </ul>
    </Section>

    <Section title="Memory">
      <div className="max-w-xl flex flex-col gap-6">
        <MemoryOffersLine offers={SAMPLE_FACTS} mascot={SAMPLE_MASCOT} kept={false} onAnswer={() => undefined} />
        <MemoryOffersLine
          offers={SAMPLE_FACTS}
          mascot={SAMPLE_MASCOT}
          kept={false}
          errors={{ "gallery-fact-1": "This mascot already remembers 30 things. Forget one on its page first." }}
          onAnswer={() => undefined}
        />
        <MemoryOffersLine offers={[]} mascot={SAMPLE_MASCOT} kept onAnswer={() => undefined} />
        <RememberedFacts used={SAMPLE_FACTS.slice(0, 1)} />
        <RememberedFacts used={SAMPLE_FACTS} />
        <RememberedFacts
          used={[
            ...SAMPLE_FACTS,
            { ...(SAMPLE_FACTS[0] ?? missing("a sample fact")), id: "gallery-fact-3", text: "You never buy refurbished." },
          ]}
        />
        <MascotMemoryView mascot={SAMPLE_MASCOT} facts={[]} offers={[]} onBack={() => undefined} />
        <MascotMemoryView
          mascot={SAMPLE_MASCOT}
          facts={SAMPLE_FACTS}
          offers={[
            {
              id: "gallery-offer",
              mascotId: SAMPLE_MASCOT.id,
              sourceId: "gallery-chat",
              text: "You only buy from shops with free returns.",
              site: null,
            },
          ]}
          onBack={() => undefined}
        />
      </div>
    </Section>

    <Section title="Routine runs">
      <ol className="max-w-xl">
        {SAMPLE_RUNS.map((run, at) => (
          <RoutineRunRow key={run.id} run={run} open={at === 0} onStop={() => undefined} onRunAgain={() => undefined} />
        ))}
      </ol>
    </Section>

    <Section title="A routine's When step">
      <StepCard mascot={null} mood="rest" label="2 / 4" question="When?" nav={<div className="h-[46px]" />}>
        <ScheduleSentence values={routineForm} className="mb-4 text-center" />
        <WhenAnswer values={routineForm} set={(patch) => setRoutineForm({ ...routineForm, ...patch })} />
      </StepCard>
    </Section>
  </>
);
