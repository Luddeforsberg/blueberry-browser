import React, { useEffect, useRef, useState } from "react";
import { Check, Lock, X } from "lucide-react";
import { PasswordInput } from "./PasswordInput";
import { BERRY } from "@shared/mascots";
import { firstJobsFor, firstRunStart, firstRunSteps, type FirstRunStep } from "@shared/firstRun";
import { BIG_CARD, BIG_SHELL } from "@common/components/cardShell";
import { cn } from "@common/lib/utils";
import { useShell } from "../contexts/useShell";
import { AiKeyForm } from "./AiKeyForm";
import { useKeyTry } from "./useAiKey";
import { BerrySpot } from "./Berry";
import { SourceRows } from "./HistoryImport";
import { useHistoryImport } from "./useHistoryImport";
import { StepCard, StepNav } from "./StepCard";
import { LINK, Primary, LinkNav, Under, Says, Field, INPUT } from "./FirstRunParts";
import { MakeItYours, MiniWindow, WhatICanSee } from "./FirstRunSettings";
import { missing } from "@shared/missing";

// DESIGN.md section 10, First run: Berry and one card in an empty window, a step at a time, in the card that makes a
// mascot. Every step's answer is real: an account on the server, the look, a key the service has answered with, history
// brought in, and the settings themselves. Leaving part way keeps what's done, and the next launch starts at the first
// step that isn't.

const api = window.chromeAPI;

const SOURCE_FACTS = [
  { Icon: Check, text: "Addresses, page titles and visit times, from the last 90 days" },
  { Icon: X, text: "Never passwords, cookies or what you typed" },
  { Icon: Lock, text: "It stays on this computer" },
];

interface Start {
  steps: FirstRunStep[];
  at: number;
  browsers: boolean;
}

// It starts at a step there is, and goes on no further than the last.
const stepAt = (steps: FirstRunStep[], at: number): FirstRunStep => steps[at] ?? missing(`first run step ${at}`);

const Steps: React.FC<{ start: Start }> = ({ start }) => {
  const { settings, updateSettings } = useShell();
  const { steps, browsers } = start;
  const [at, setAt] = useState(start.at);
  const [from, setFrom] = useState<"next" | "back">("next");
  // Settings come back from main a moment later, so what's been passed is kept here as well.
  const passed = useRef(new Set(settings.firstRun));
  const step = stepAt(steps, at);
  const numbered: FirstRunStep[] = steps.filter((each) => each !== "meet");
  const label = step === "meet" ? "" : `${numbered.indexOf(step) + 1} / ${numbered.length}`;

  const keyTry = useKeyTry();
  const history = useHistoryImport();

  // The account step: Create account, or Welcome back once asked for.
  const [signingIn, setSigningIn] = useState(false);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [name, setName] = useState(settings.accountName ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; about: "email" | "password" | null } | null>(null);
  useEffect(() => {
    void api.account.state().then((state) => setSignedIn(state.status === "signed-in" ? state.email : null));
  }, []);

  const go = (to: number) => {
    setFrom(to > at ? "next" : "back");
    setAt(to);
  };
  const next = () => {
    passed.current.add(step);
    updateSettings({ firstRun: [...passed.current] });
    go(at + 1);
  };
  const back = at > 0 ? () => go(at - 1) : undefined;
  const finish = () => updateSettings({ onboarded: true, firstJobs: firstJobsFor({ hasKey: keyTry.saved.service !== null, browsers }) });

  const account = async () => {
    if (busy) return;
    setBusy(true);
    const state = await (signingIn ? api.account.signIn(email, password) : api.account.signUp(email, password));
    setBusy(false);
    // The password went to main once, and isn't kept here.
    setPassword("");
    if (state.status !== "signed-in") {
      setProblem(state.problem ? { text: state.problem, about: state.problemAbout } : null);
      return;
    }
    setProblem(null);
    setSignedIn(state.email);
    if (!signingIn) updateSettings({ accountName: name.trim() || null });
    next();
  };
  const accountReady = !!email.trim() && !!password && (signingIn || !!name.trim());

  // What the filled button does on this step, which Enter does too, or null while it's off.
  const primary: (() => void) | null =
    step === "meet" || step === "yours"
      ? next
      : step === "account"
        ? signedIn
          ? next
          : accountReady && !busy
            ? () => void account()
            : null
        : step === "brain"
          ? keyTry.works
            ? next
            : keyTry.canTry
              ? () => void keyTry.tryKey()
              : null
          : step === "history"
            ? history.done
              ? next
              : history.source && !history.busy
                ? () => void history.bringIn()
                : null
            : finish;
  const pressed = useRef(primary);
  useEffect(() => {
    pressed.current = primary;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing || event.defaultPrevented) return;
      // A button, a link or a choice does its own thing with Enter.
      if ((event.target as HTMLElement).closest('button, a, [role="radio"]')) return;
      event.preventDefault();
      pressed.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = (button: React.ReactNode) => (
    <StepNav step={numbered.indexOf(step)} steps={numbered.length} onBack={back}>
      {button}
    </StepNav>
  );
  const card = {
    mascot: BERRY,
    mood: "curious" as const,
    label,
    motionKey: step === "account" ? `account-${signingIn}` : step,
    from,
    mascotSize: 64,
  };

  if (step === "meet") {
    return (
      <section aria-label="Hi, I’m Berry." className="w-[520px] max-w-full mx-auto flex flex-col items-center">
        <div className="relative z-[1] -mb-1">
          <BerrySpot size={88} mascot={BERRY} mood="rest" />
        </div>
        <div className={cn(BIG_SHELL, "w-full")}>
          <div className={cn(BIG_CARD, "bg-card px-7 pt-[30px] pb-[26px] text-center")}>
            <h1 className="mb-2 text-30 font-medium tracking-[-0.025em]">Hi, I’m Berry.</h1>
            <p className="mx-auto max-w-[452px] text-14 leading-[1.5] text-ink-2">
              I do things for you in this browser: look things up, fill things in, keep an eye on pages. I always ask before anything that
              matters.
            </p>
            <p className="mt-3 text-13 text-ink-3">Two minutes, and you can change all of it later.</p>
          </div>
          <LinkNav
            link={
              steps.includes("account") && (
                <button
                  type="button"
                  className={LINK}
                  onClick={() => {
                    setSigningIn(true);
                    next();
                  }}
                >
                  I already have an account
                </button>
              )
            }
          >
            <Primary onClick={next}>Get started</Primary>
          </LinkNav>
        </div>
      </section>
    );
  }

  if (step === "account" && signedIn) {
    return (
      <StepCard {...card} question="First, who are you?" nav={nav(<Primary onClick={next}>Continue</Primary>)}>
        <Says pill="Done">You’re signed in as {signedIn}.</Says>
      </StepCard>
    );
  }

  if (step === "account" && signingIn) {
    return (
      <StepCard
        {...card}
        label=""
        question="Welcome back."
        nav={
          <LinkNav
            link={
              <button
                type="button"
                className={LINK}
                onClick={() => {
                  setSigningIn(false);
                  setProblem(null);
                }}
              >
                Make a new account
              </button>
            }
          >
            <Primary disabled={!primary} onClick={() => primary?.()}>
              Sign in
            </Primary>
          </LinkNav>
        }
      >
        <Field label="Email" problem={problem?.about === "email" ? problem.text : null}>
          <input
            type="email"
            autoFocus
            autoComplete="username"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Password" problem={problem && problem.about !== "email" ? problem.text : null}>
          <PasswordInput value={password} onChange={setPassword} isNew={false} className={INPUT} />
        </Field>
      </StepCard>
    );
  }

  if (step === "account") {
    return (
      <StepCard
        {...card}
        question="First, who are you?"
        hint="Your account is how you publish mascots, run jobs in the cloud and answer from your phone. What you browse stays on this computer."
        nav={nav(
          <Primary disabled={!primary} onClick={() => primary?.()}>
            Create account
          </Primary>,
        )}
      >
        <Field label="Your name">
          <input autoFocus autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={INPUT} />
        </Field>
        <Field label="Email" problem={problem?.about === "email" ? problem.text : null}>
          <input
            type="email"
            autoComplete="username"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Password" problem={problem && problem.about !== "email" ? problem.text : null} hint="At least 8 characters.">
          <PasswordInput value={password} onChange={setPassword} isNew className={INPUT} />
        </Field>
      </StepCard>
    );
  }

  if (step === "yours") {
    return (
      <StepCard
        {...card}
        question="Make it yours."
        hint="The window changes as you choose."
        nav={nav(<Primary onClick={next}>Continue</Primary>)}
        aside={
          <div className="w-[322px] shrink-0 grid place-items-center bg-tray shadow-[inset_1px_0_0_var(--line)]">
            <MiniWindow tabs={settings.layoutMode} />
          </div>
        }
      >
        <MakeItYours settings={settings} updateSettings={updateSettings} />
      </StepCard>
    );
  }

  if (step === "brain") {
    return (
      <>
        <StepCard
          {...card}
          question="Give me a brain."
          hint="I think with an AI service, using a key that’s yours."
          nav={nav(
            <Primary disabled={!primary} onClick={() => primary?.()}>
              {keyTry.works ? "Continue" : "Try the key"}
            </Primary>,
          )}
        >
          <AiKeyForm keyTry={keyTry} inCard />
        </StepCard>
        {!keyTry.works && (
          <Under label="I’ll do this later" onPress={next}>
            Without a key I can’t answer, but everything else works.
          </Under>
        )}
      </>
    );
  }

  if (step === "history") {
    const failed = !!history.message && !history.done;
    return (
      <>
        <StepCard
          {...card}
          question="Shall I bring your history over?"
          hint="Then I can suggest things from day one, and the address field knows where you’ve been."
          nav={nav(
            <Primary disabled={!primary} onClick={() => primary?.()}>
              {history.done ? "Continue" : failed ? "Try again" : "Bring it in"}
            </Primary>,
          )}
        >
          <SourceRows history={history} />
          {failed ? (
            <p role="alert" className="mt-3 mx-1 text-14 text-ask text-left">
              {history.message}
            </p>
          ) : (
            <ul className="mt-3.5 mx-1 flex flex-col gap-1.5 text-left">
              {SOURCE_FACTS.map(({ Icon, text }) => (
                <li key={text} className="flex gap-[9px] text-13 text-ink-2">
                  <Icon aria-hidden className="mt-[3px] size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
                  {text}
                </li>
              ))}
            </ul>
          )}
        </StepCard>
        {!history.done && (
          <Under label="Skip" onPress={next}>
            You can bring it in later, from Settings.
          </Under>
        )}
      </>
    );
  }

  return (
    <StepCard
      {...card}
      question="What I can see."
      hint="One thing is always true. The rest are real settings, here or later."
      nav={nav(<Primary onClick={finish}>Start browsing</Primary>)}
    >
      <WhatICanSee settings={settings} updateSettings={updateSettings} />
    </StepCard>
  );
};

export const FirstRun: React.FC = () => {
  const { settings } = useShell();
  const [passed] = useState(settings.firstRun);
  const [start, setStart] = useState<Start | null>(null);

  // Which steps there are, and where to start, from what main says once. They don't change while it's open.
  useEffect(() => {
    void Promise.all([api.account.state(), api.aiKey.state(), api.browser.importSources()]).then(([account, key, sources]) => {
      const browsers = sources.length > 0;
      const steps = firstRunSteps({ accounts: account.status !== "not-set-up", browsers });
      setStart({
        steps,
        browsers,
        at: firstRunStart(steps, { passed, signedIn: account.status === "signed-in", hasKey: key.service !== null }),
      });
    });
  }, [passed]);

  return (
    <div className="absolute inset-0 bg-well app-region-drag">
      {/* The well's dot grid, faded away from the middle where the card is read. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,var(--dot)_1px,transparent_1.3px)] bg-[length:14px_14px] [mask-image:radial-gradient(ellipse_66%_84%_at_50%_50%,transparent_0,transparent_48%,#000_86%)]"
      />
      <main className="relative h-full overflow-y-auto flex flex-col items-center justify-center px-4 py-12">
        <div className="app-region-no-drag">{start && <Steps start={start} />}</div>
      </main>
    </div>
  );
};
