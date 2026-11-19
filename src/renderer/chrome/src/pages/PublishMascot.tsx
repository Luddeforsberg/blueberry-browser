import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";
import type { PublishChoices } from "@shared/library";
import {
  GALLERY_CATEGORIES,
  MAX_AUTHOR,
  MAX_DESCRIPTION,
  parsePublicDraft,
  parsePublishChoices,
  publishWarnings,
} from "@shared/publishing";
import { Button } from "@common/components/Button";
import { QuietChoice } from "@common/components/Controls";
import { cn } from "@common/lib/utils";
import { AccountForm } from "../components/AccountForm";
import { Berry } from "../components/Berry";
import { CopyLink } from "../components/CopyLink";
import { ChatError } from "../components/ChatMessage";
import { useMascots, useLibrary } from "../contexts/useLibrary";
import { useShell } from "../contexts/useShell";
import { lastExchange, type PublishValues } from "../mascotsView";
import { useAccount } from "../useAccount";
import { GalleryTile } from "./MascotGalleryPage";
import { INPUT, Field } from "./PublishField";
import { ExampleField } from "./PublishExample";
import { WhatGoesPublic } from "./WhatGoesPublic";

const MASCOT_SIZE = 148;
// How far down the standing drawing its feet reach, so its toes grip the line under it.
const FEET_Y = 113 / 120;

export const PublishMascot: React.FC<{
  mascotId: string;
  values: PublishValues;
  onChange: (values: PublishValues) => void;
  onBack: () => void;
}> = ({ mascotId, values, onChange, onBack }) => {
  const { mascots } = useMascots();
  const { chats } = useLibrary();
  const [account, setAccount] = useAccount();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [loadTries, setLoadTries] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  // Once it's public this page is about sharing it, and the form is one press away.
  const [editing, setEditing] = useState(false);
  const [addCount, setAddCount] = useState(0);
  // What's public now, which the form's unsaved words aren't.
  const [listed, setListed] = useState<PublishChoices | null>(null);
  const { showBerry } = useShell().settings;
  const latest = useRef(values);
  latest.current = values;
  const mascot = mascots.find(({ id }) => id === mascotId);
  // What the fill below starts from, as it starts. It runs only when it's first possible, whatever's typed by then.
  const startedWith = useRef({ publishedId: mascot?.publishedId, loadFailed, onChange });
  startedWith.current = { publishedId: mascot?.publishedId, loadFailed, onChange };
  const set = (patch: Partial<PublishValues>) => onChange({ ...values, ...patch });
  const own = chats.filter((chat) => chat.mascotId === mascotId);

  // Once, from what's already published, or the name they last used. It never starts from the account.
  useEffect(() => {
    if (values.filledIn || account.status !== "signed-in") return;
    const { publishedId, loadFailed: failedBefore, onChange: fill } = startedWith.current;
    let left = false;
    void (async () => {
      const [mine, author] = await Promise.all([window.chromeAPI.mascots.published(), window.chromeAPI.mascots.lastAuthor()]);
      if (left) return;
      // Blank defaults here would take what's public away on the next update, so it waits until it knows.
      if (mine === null && publishedId) {
        setLoadFailed(true);
        setError("Couldn’t get what’s already public, so it can’t be updated yet.");
        return;
      }
      if (failedBefore) setError(null);
      setLoadFailed(false);
      const current = mine?.find(({ id }) => id === publishedId);
      if (current?.link) setLink(current.link);
      if (current?.addCount !== undefined) setAddCount(current.addCount);
      // Whatever was typed or picked while this was on its way stays.
      const now = latest.current;
      const keepExample = now.exampleChatId !== null;
      fill({
        ...now,
        filledIn: true,
        author: now.author || (current?.author ?? author),
        description: now.description || (current?.description ?? ""),
        category: now.category !== "Other" ? now.category : (current?.category ?? "Other"),
        prompt: keepExample ? now.prompt : (current?.example?.prompt ?? ""),
        answer: keepExample ? now.answer : (current?.example?.answer ?? ""),
        checked: keepExample ? now.checked : Boolean(current?.example),
        exampleChatId: keepExample ? now.exampleChatId : current?.example ? "published" : null,
      });
    })();
    return () => {
      left = true;
    };
  }, [values.filledIn, account.status, loadTries]);

  useEffect(() => {
    if (account.status !== "signed-in" || !mascot?.publishedId) return;
    let left = false;
    void window.chromeAPI.mascots.published().then((mine) => {
      const current = mine?.find(({ id }) => id === mascot.publishedId);
      if (left || !current) return;
      setListed({ author: current.author, description: current.description, category: current.category, example: current.example });
      if (current.link) setLink(current.link);
      setAddCount(current.addCount);
    });
    return () => {
      left = true;
    };
  }, [account.status, mascot?.publishedId]);

  const hasExample = values.exampleChatId !== null;
  const typed: PublishChoices = {
    author: values.author,
    description: values.description,
    category: values.category,
    example: hasExample ? { prompt: values.prompt, answer: values.answer } : null,
  };
  const draft = useMemo(() => (mascot ? parsePublicDraft(mascot) : null), [mascot]);
  const parsed = parsePublishChoices(typed);
  // The same clean text main will send, once what's typed is good enough to send.
  const choices = "choices" in parsed ? parsed.choices : typed;
  const warnings = mascot ? publishWarnings(mascot, choices) : [];

  const pickChat = async (chatId: string | null) => {
    setError(null);
    if (chatId === null) return set({ exampleChatId: null, prompt: "", answer: "", checked: false });
    const exchange = lastExchange((await window.chromeAPI.library.getChat(chatId)) ?? { messages: [] });
    if (!exchange) return setError("That chat has no finished answer yet.");
    return set({ exampleChatId: chatId, ...exchange, checked: false });
  };

  const publish = async () => {
    if (hasExample && !values.checked) return setError("Read the example first, and tick the box to say it’s fine to go public.");
    if ("error" in parsed) return setError(parsed.error);
    setBusy(true);
    const result = await window.chromeAPI.mascots.publish(mascotId, parsed.choices);
    setBusy(false);
    setError(result.ok ? null : result.error);
    if (result.ok) {
      setLink(result.link);
      setListed(parsed.choices);
      setEditing(false);
      document.getElementById("publish-top")?.scrollIntoView();
    }
    return undefined;
  };

  const unpublish = async () => {
    if (!mascot?.publishedId) return;
    const result = await window.chromeAPI.mascots.unpublish(mascot.publishedId);
    if (result.ok) {
      setLink(null);
      setListed(null);
      setEditing(false);
    } else if (result.error) setError(result.error);
  };

  if (!mascot) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft strokeWidth={1.75} />
          Your mascots
        </Button>
        <p className="mt-4 text-14 text-ink-2">This mascot is no longer one of yours.</p>
      </>
    );
  }

  if (account.status === "signed-in" && mascot.publishedId && !editing) {
    return (
      <div id="publish-top" className="max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
          <ArrowLeft strokeWidth={1.75} />
          Your mascots
        </Button>
        {/* It lands on the line under the heading with the job done, and the link is the next thing to do. */}
        <header className="mt-3 flex items-end gap-6 border-b">
          <div className="min-w-0 flex-1 pb-5 [overflow-wrap:anywhere]">
            <h1 className="text-20 font-semibold">{mascot.name} is in the Gallery</h1>
            <p className="mt-1 text-14 text-ink-2">
              Anyone can read what it’s told and add their own copy. Send this to someone who’d like it.
            </p>
          </div>
          <div
            key={mascot.publishedId}
            className="relative shrink-0"
            style={{ width: showBerry ? MASCOT_SIZE : 32, height: showBerry ? MASCOT_SIZE * FEET_Y : 32 }}
          >
            <Berry mood="delivered" size={showBerry ? MASCOT_SIZE : 32} mascot={mascot} />
          </div>
        </header>

        <section aria-label="Published" className="py-5 border-b">
          {link ? (
            <>
              <p className="text-15 font-medium [overflow-wrap:anywhere]">{link}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyLink link={link} main />
                <Button variant="raised" size="sm" onClick={() => void window.chromeAPI.browser.createTab(link)}>
                  <ExternalLink strokeWidth={1.75} />
                  Open it
                </Button>
              </div>
            </>
          ) : (
            <p className="text-14 text-ink-2">
              Its public page isn’t set up yet, so there’s no link to share. It’s in the Gallery all the same.
            </p>
          )}
        </section>

        {listed && (
          <section aria-label="How it looks" className="pt-5">
            <h2 className="text-14 font-medium">How it looks in the Gallery</h2>
            <div aria-label="Preview of the Gallery" role="group" className="mt-3 w-[170px]">
              <GalleryTile
                entry={{
                  id: mascot.publishedId,
                  draft: mascot,
                  author: listed.author,
                  description: listed.description,
                  category: listed.category,
                  example: listed.example ?? undefined,
                  addCount,
                }}
              />
            </div>
          </section>
        )}

        {error && (
          <div className="mt-4">
            <ChatError message={error} />
          </div>
        )}

        <div className="mt-4 -ml-3 flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" className="text-ink-2" onClick={() => setEditing(true)}>
            Edit the listing
          </Button>
          <Button variant="ghost" size="sm" className="text-ink-2" onClick={() => void unpublish()}>
            Unpublish
          </Button>
        </div>
        <p className="mt-1 text-13 text-ink-2">
          What you save on the mascot itself stays out of this until you edit the listing and update it.
        </p>
      </div>
    );
  }

  return (
    <div id="publish-top" className="max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
        <ArrowLeft strokeWidth={1.75} />
        Your mascots
      </Button>
      <h1 className="mt-3 text-20 font-semibold [overflow-wrap:anywhere]">
        {mascot.publishedId ? `Edit ${mascot.name}’s listing` : `Publish ${mascot.name}`}
      </h1>

      {account.status === "signed-out" && (
        <>
          <p className="mt-1 mb-5 text-14 text-ink-2">
            Anyone can add a published mascot, so publishing needs an account. You’ll see everything that goes public before it does.
          </p>
          <AccountForm problem={account.problem} onResult={setAccount} />
        </>
      )}

      {account.status === "signed-in" && (
        <>
          <p className="mt-1 pb-5 border-b text-14 text-ink-2">
            {mascot.publishedId
              ? "Nothing here changes what’s public until you press Update."
              : "Anyone will be able to read this and add a copy."}
          </p>

          {draft && "error" in draft && (
            <div className="mt-4">
              <ChatError message={draft.error} />
            </div>
          )}

          <Field
            title="Your name, as the author"
            hint="Whatever you like. It’s the only thing that says who made this."
            htmlFor="publish-author"
          >
            <input
              id="publish-author"
              maxLength={MAX_AUTHOR}
              value={values.author}
              autoComplete="off"
              onChange={(event) => set({ author: event.target.value })}
              className={cn(INPUT, "h-9 max-w-xs")}
            />
          </Field>
          <Field title="What it does, in one line" htmlFor="publish-description">
            <input
              id="publish-description"
              maxLength={MAX_DESCRIPTION}
              value={values.description}
              onChange={(event) => set({ description: event.target.value })}
              className={cn(INPUT, "h-9")}
            />
          </Field>
          <Field title="Category">
            <QuietChoice
              label="Category"
              value={values.category}
              onChange={(category) => set({ category })}
              options={GALLERY_CATEGORIES.map((category) => ({ value: category, label: category }))}
            />
          </Field>

          <ExampleField values={values} set={set} own={own} mascot={mascot} hasExample={hasExample} pickChat={pickChat} />

          <WhatGoesPublic mascot={mascot} choices={choices} />

          {warnings.length > 0 && (
            <ul aria-label="Before you publish" className="mt-4 flex flex-col gap-1 text-14 text-ask">
              {warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2">
                  <AlertTriangle aria-hidden className="mt-[3px] size-4 shrink-0" />
                  {warning} Anyone could read it. You can still publish if that’s fine.
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div className="mt-4">
              <ChatError message={error} />
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            {loadFailed && (
              <Button variant="raised" onClick={() => setLoadTries((tries) => tries + 1)}>
                Try again
              </Button>
            )}
            <Button
              disabled={busy || (Boolean(mascot.publishedId) && !values.filledIn) || (draft !== null && "error" in draft)}
              onClick={() => void publish()}
            >
              {busy ? "Publishing…" : mascot.publishedId ? "Update what’s public" : "Publish for anyone to read"}
            </Button>
            <Button variant="ghost" onClick={mascot.publishedId ? () => setEditing(false) : onBack}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
