import React from "react";
import { UserMessage } from "../../components/ChatMessage";
import { Composer } from "../../components/Composer";
import { FileChip, SentAttachments, TabChip } from "../../components/AttachmentChips";
import { AddMenu } from "../../components/AddMenu";
import { ATTACHMENT_WORDS } from "@shared/attachments";
import { AskSheet, MenuEntryRow } from "../../MenuApp";
import { leadsWithGlyph } from "../../components/menuRows";
import { MenuRule, MenuSheet } from "../../components/MenuSheet";
import { BERRY } from "@shared/mascots";
import { SuggestionItem } from "../../components/SuggestionItem";
import { Section } from "./Section";
import { SAMPLE_TABS, MANY_TABS, sampleAdd, SAMPLE_MASCOT, SAMPLE_ROWS, MENU_SAMPLES, ASK_SAMPLES } from "./gallerySamples";
import { missing } from "@shared/missing";

// The prompt box, our menus and Asking first, the + menu and suggestions.
export const ComposerSections: React.FC = () => (
  <>
    <Section title="Prompt box">
      <div className="flex flex-col gap-6 p-6 rounded-tile bg-well">
        <div className="max-w-[640px] pb-[150px]">
          <Composer
            size="hero"
            label="Empty"
            placeholder="Ask Berry, or type an address"
            value=""
            onChange={() => undefined}
            canSend={false}
            onSend={() => undefined}
            mascot={BERRY}
            onChooseMascot={() => undefined}
            cloud={{ on: false, onToggle: () => undefined }}
          />
        </div>
        <div className="max-w-[640px]">
          <Composer
            size="hero"
            label="Ready, limited"
            placeholder="Ask Scout"
            value="What happened in Malmö today?"
            onChange={() => undefined}
            canSend
            onSend={() => undefined}
            mascot={SAMPLE_MASCOT}
            onChooseMascot={() => undefined}
            cloud={{ on: true, onToggle: () => undefined }}
            limits="Only visits github.com. Can’t type or click."
          />
        </div>
        <div className="max-w-[420px]">
          <Composer
            label="In a chat, while it replies"
            placeholder="Tell Berry something"
            value=""
            onChange={() => undefined}
            canSend={false}
            onSend={() => undefined}
            onStop={() => undefined}
            add={sampleAdd()}
            mascot={BERRY}
          />
        </div>
        <div className="max-w-[640px]">
          <Composer
            size="hero"
            label="With a tab, a picture, a PDF and a refused file"
            placeholder="Ask Berry, or type an address"
            value="Is this cheaper than what I booked?"
            onChange={() => undefined}
            canSend
            onSend={() => undefined}
            mascot={BERRY}
            onChooseMascot={() => undefined}
            add={sampleAdd()}
            attachment={
              <div className="flex flex-wrap gap-1.5">
                <TabChip tab={SAMPLE_TABS[0] ?? missing("a sample tab")} onRemove={() => undefined} />
                <FileChip file={{ kind: "picture", name: "boarding-pass.png", fact: null, thumbnail: null }} onRemove={() => undefined} />
                <FileChip file={{ kind: "pdf", name: "itinerary.pdf", fact: "3 pages", thumbnail: null }} onRemove={() => undefined} />
                <FileChip
                  file={{
                    kind: "text",
                    name: "notes.txt",
                    fact: ATTACHMENT_WORDS.cutShort,
                    factInFull: ATTACHMENT_WORDS.cutShortInFull,
                    thumbnail: null,
                  }}
                  onRemove={() => undefined}
                />
                <FileChip
                  file={{ kind: null, name: "holiday.mov", fact: null, thumbnail: null }}
                  problem={ATTACHMENT_WORDS.video}
                  onRemove={() => undefined}
                />
                <TabChip
                  tab={SAMPLE_TABS[1] ?? missing("a second sample tab")}
                  problem={ATTACHMENT_WORDS.tabToCloud}
                  onRemove={() => undefined}
                />
              </div>
            }
          />
        </div>
        <div className="max-w-[640px] flex flex-col gap-2">
          <UserMessage content="Is this cheaper than what I booked?" />
          <SentAttachments
            attached={[
              { kind: "tab", title: "Flights to Lisbon", site: "klm.com" },
              { kind: "pdf", name: "itinerary.pdf", fact: "3 pages", thumbnail: null },
            ]}
          />
        </div>
      </div>
    </Section>

    <Section title="Our menus and Asking first">
      <div className="flex flex-wrap items-start gap-8">
        {MENU_SAMPLES.map(({ label, entries }) => (
          <MenuSheet
            key={label}
            label={label}
            at={{ x: 0, y: 0 }}
            autoFocus={false}
            onClose={() => undefined}
            className="static w-max min-w-[180px] max-w-[360px]"
          >
            {entries.map((entry, index) =>
              entry.kind === "rule" ? (
                <MenuRule key={index} />
              ) : (
                <MenuEntryRow
                  key={entry.id}
                  row={entry}
                  path={String(index)}
                  lead={leadsWithGlyph(entries)}
                  plain={false}
                  open={entry.submenu !== null}
                  onPress={() => undefined}
                />
              ),
            )}
          </MenuSheet>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-start gap-6">
        {ASK_SAMPLES.map((ask) => (
          <div key={ask.id} className="p-6 rounded-menu bg-dim">
            <AskSheet ask={ask} onAnswer={() => undefined} focusCancel={false} />
          </div>
        ))}
      </div>
    </Section>

    <Section title="The + menu">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-6 gap-y-[300px] p-6 pb-[300px] rounded-tile bg-well">
        <div className="relative h-0">
          <AddMenu
            {...sampleAdd({ showHow: { label: "Show Berry how", note: "makes a routine", problem: null, onStart: () => undefined } })}
            above={false}
            onClose={() => undefined}
          />
        </div>
        <div className="relative h-0">
          <AddMenu
            {...sampleAdd({
              tabs: { problem: null, note: null, load: async () => MANY_TABS, added: ["g-2"], onChoose: () => undefined },
            })}
            above={false}
            onClose={() => undefined}
          />
        </div>
        <div className="relative h-0">
          <AddMenu
            {...sampleAdd({ thisPage: { site: "klm.com", favicon: null, problem: null, onAdd: () => undefined } })}
            above={false}
            onClose={() => undefined}
          />
        </div>
        <div className="relative h-0">
          <AddMenu
            {...sampleAdd({
              tabs: {
                problem: null,
                note: "Deal Watcher only visits prisjakt.nu",
                load: async () => [],
                added: [],
                onChoose: () => undefined,
              },
            })}
            above={false}
            onClose={() => undefined}
          />
        </div>
        <div className="relative h-0">
          <AddMenu
            {...sampleAdd({
              tabs: {
                problem: ATTACHMENT_WORDS.tabToCloud,
                note: null,
                load: async () => SAMPLE_TABS,
                added: [],
                onChoose: () => undefined,
              },
              files: { problem: ATTACHMENT_WORDS.fileToCloud, onChoose: () => undefined },
            })}
            above={false}
            onClose={() => undefined}
          />
        </div>
      </div>
    </Section>

    <Section title="Suggestions">
      <div className="max-w-[640px] flex flex-col gap-4">
        <ul aria-label="Every kind">
          {SAMPLE_ROWS.map((row) => (
            <SuggestionItem
              key={row.key}
              row={row}
              onPress={() => undefined}
              onDismiss={row.kind === "suggestion" ? () => undefined : undefined}
            />
          ))}
        </ul>
        <ul aria-label="Its prompt in the box">
          <SuggestionItem row={SAMPLE_ROWS.at(-1) ?? missing("a sample row")} used onPress={() => undefined} />
        </ul>
      </div>
    </Section>
  </>
);
