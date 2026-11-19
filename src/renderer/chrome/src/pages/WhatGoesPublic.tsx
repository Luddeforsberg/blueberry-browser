import React from "react";
import { Lock, LockOpen } from "lucide-react";
import type { MascotDraft, MascotExample, MascotProfile, PublishChoices } from "@shared/library";
import { ACCESSORIES, PALETTES, permissionsInWords } from "@shared/mascots";
import { Berry } from "../components/Berry";
import { Markdown } from "../components/ChatMessage";

// Part of publishing a mascot (PublishMascot.tsx): exactly what goes public.

const Line: React.FC<{ term: string; children: React.ReactNode }> = ({ term, children }) => (
  <div className="grid grid-cols-[120px_1fr] gap-3 py-3 border-b last:border-b-0">
    <dt className="text-14 text-ink-2">{term}</dt>
    <dd className="min-w-0 text-14 [overflow-wrap:anywhere]">{children}</dd>
  </div>
);

// What it may do, in words, read from its real limits. Open means it isn't limited.
const Permissions: React.FC<{ draft: Pick<MascotDraft, "sites" | "tools"> }> = ({ draft }) => (
  <ul aria-label="What it’s allowed to do" className="flex flex-wrap gap-x-4 gap-y-0.5 text-13 text-ink-2">
    {permissionsInWords(draft).map(({ text, open }) => {
      const Icon = open ? LockOpen : Lock;
      return (
        <li key={text} className="flex items-start gap-1.5 [overflow-wrap:anywhere]">
          <Icon aria-hidden className="shrink-0 mt-[2px] size-3" />
          {text}
        </li>
      );
    })}
  </ul>
);

// The example as it will go: the question as typed, and the answer as it reads in the Gallery, which can't fetch an
// image or dress up a link.
const ExampleText: React.FC<{ example: MascotExample }> = ({ example }) => (
  <>
    <h3 className="text-13 text-ink-2">I asked this</h3>
    <p className="mt-1 text-14 whitespace-pre-wrap [overflow-wrap:anywhere]">{example.prompt}</p>
    <h3 className="mt-4 text-13 text-ink-2">And here’s what it gave me</h3>
    <Markdown content={example.answer} fromStranger className="mt-1 text-14 [overflow-wrap:anywhere]" />
  </>
);

const labelOf = (list: { id: string; label: string }[], id: string) => list.find((item) => item.id === id)?.label ?? id;

// Exactly what goes public, from the clean text main will send.
export const WhatGoesPublic: React.FC<{ mascot: MascotProfile; choices: PublishChoices }> = ({ mascot, choices }) => (
  <section aria-label="What goes public" className="mt-6">
    <h2 className="text-14 font-medium">Exactly what goes public</h2>
    <p className="mt-0.5 text-14 text-ink-2">This and nothing else: never your chats, your history or your account’s email.</p>
    <dl className="mt-2">
      <Line term="Name and look">
        <span className="flex items-center gap-2">
          <Berry size={32} mascot={mascot} />
          {mascot.name}, {labelOf(PALETTES, mascot.look.palette)}, {labelOf(ACCESSORIES, mascot.look.accessory).toLowerCase()}
        </span>
      </Line>
      <Line term="Author">{choices.author.trim() || <span className="text-ink-2">Not chosen yet</span>}</Line>
      <Line term="What it does">{choices.description.trim() || <span className="text-ink-2">Not written yet</span>}</Line>
      <Line term="Category">{choices.category}</Line>
      <Line term="Sites and tools">
        <Permissions draft={mascot} />
      </Line>
      <Line term="Its instructions">
        <span className="whitespace-pre-wrap">{mascot.instructions}</span>
      </Line>
      <Line term="Example">{choices.example ? <ExampleText example={choices.example} /> : <span className="text-ink-2">None</span>}</Line>
    </dl>
  </section>
);
