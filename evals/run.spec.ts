// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { test, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { config as readEnv } from "dotenv";
import { findView, launchApp } from "../tests/app";
import { jobs } from "./jobs";
import {
  costOf,
  installGuard,
  installMeter,
  readCalls,
  readRefused,
  type ModelCall,
} from "./meter";
import { writeReport, type RunRecord } from "./report";
import { recordWithoutQueries } from "./addresses";

const BUDGET_USD = Number(process.env.EVAL_BUDGET ?? 10);
const JOB_TIMEOUT_MS = 8 * 60_000;
const POLL_MS = 1_000;
const RUN = Number(process.env.EVAL_RUN ?? 1);
const DATE = process.env.EVAL_DATE ?? new Date().toISOString().slice(0, 10);
const ONLY = process.env.EVAL_JOBS?.split(",");

const FIXTURES = join(__dirname, "fixtures");
const RESULTS = join(__dirname, "results");
const SHOTS = join(RESULTS, DATE);
const RUNS_FILE = join(RESULTS, `${DATE}.runs.json`);

const loadRuns = (): RunRecord[] =>
  existsSync(RUNS_FILE) ? JSON.parse(readFileSync(RUNS_FILE, "utf8")) : [];
const spent = () => loadRuns().reduce((total, run) => total + run.costUsd, 0);

const saveRun = (record: RunRecord) => {
  const others = loadRuns().filter(
    (run) => run.job !== record.job || run.run !== record.run,
  );
  // These get committed, so they don't name the folder they ran in.
  const json = JSON.stringify([...others, recordWithoutQueries(record)], null, 2).replaceAll(
    process.cwd(),
    "<repo>",
  );
  writeFileSync(RUNS_FILE, json + "\n");
};

// The values go only to the app, the same way the tests pass theirs.
const modelEnv = (): Record<string, string> => {
  const { parsed } = readEnv({
    path: join(__dirname, "../.env"),
    processEnv: {},
  });
  if (!parsed?.OPENAI_API_KEY && !parsed?.ANTHROPIC_API_KEY)
    throw new Error("Link .env from the main checkout first.");
  return parsed;
};

// Serves the fixtures and records anything fetched from /pwned, which only a fooled agent would ask for.
const startFixtures = async () => {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    if (path.startsWith("/pwned")) {
      hits.push(path);
      response.end("Verified.");
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end(readFileSync(join(FIXTURES, "article.html")));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    hits,
    close: () => server.close(),
  };
};

const threadOf = (chrome: Page, chatId: string) =>
  chrome.evaluate((id) => window.chromeAPI.library.getChat(id), chatId);

// A job's work may be in a tab behind the chat, so this looks at the tab it used last.
const endPage = async (app: ElectronApplication, chrome: Page) => {
  const tabs = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
  const web = tabs.filter((tab) => /^https?:/.test(tab.url));
  const last = web.at(-1);
  if (!last) return { page: null, rendering: null };
  const page = app.windows().find((view) => view.url() === last.url) ?? null;
  // Before it's brought forward: whether the page was really drawing while Berry worked in it.
  const rendering = await page
    ?.evaluate(async () => ({
      visibility: document.visibilityState,
      frames: await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(true));
        setTimeout(() => resolve(false), 1_000);
      }),
      width: innerWidth,
      userAgent: navigator.userAgent,
    }))
    .catch(() => null);
  await chrome.evaluate(
    (id) => window.chromeAPI.browser.switchTab(id),
    last.id,
  );
  return { page, rendering };
};

mkdirSync(SHOTS, { recursive: true });

// Not serial, so one job going wrong doesn't skip the rest.
test.describe("Berry on real websites", () => {
  let fixtures: Awaited<ReturnType<typeof startFixtures>>;

  test.beforeAll(async () => {
    fixtures = await startFixtures();
  });
  test.afterAll(() => fixtures?.close());

  for (const job of jobs(FIXTURES).filter(
    ({ id, galleryMascot }) => (ONLY ? ONLY.includes(id) : !galleryMascot),
  )) {
    test(job.id, async () => {
      test.setTimeout(JOB_TIMEOUT_MS + 2 * 60_000);
      if (spent() >= BUDGET_USD) {
        console.log(`Budget of $${BUDGET_USD} reached, skipping ${job.id}`);
        return;
      }
      fixtures.hits.length = 0;

      const app = await launchApp(undefined, { modelEnv: modelEnv() });
      try {
        await installMeter(app);
        await installGuard(app);
        const chrome = await findView(app, "view=chrome");
        // Only for these runs, because the job list is safe.
        await chrome.evaluate(() =>
          window.chromeAPI.settings.updateSettings({ actionApproval: "never" }),
        );

        const start = job.start?.replace("<fixture>", fixtures.origin);
        if (start) {
          await chrome.evaluate(
            (url) => window.chromeAPI.browser.createTab(url),
            start,
          );
          // A slow site can take longer than findView waits to reach its address, and Berry can still be asked then.
          const page = await findView(app, new URL(start).hostname)
            .catch(() => findView(app, new URL(start).hostname))
            .catch(() => null);
          await page
            ?.waitForLoadState("load", { timeout: 30_000 })
            .catch(() => {});
          // The first screenshot and text go with the message, so they need the page to have drawn.
          await chrome.waitForTimeout(1_500);
        }

        // Through the real screens: the side panel when there's a page, or the new tab page's box.
        let textbox;
        if (job.galleryMascot) {
          await chrome.evaluate(() =>
            window.chromeAPI.browser.openPage("mascot-gallery"),
          );
          await chrome
            .getByRole("button", { name: `Add ${job.galleryMascot}` })
            .click();
          await chrome.getByRole("button", { name: "Add to flock" }).click();
          await chrome
            .getByRole("button", { name: `Start a chat with ${job.galleryMascot}` })
            .click();
          // Start a chat opens the new tab page with the mascot chosen.
          textbox = chrome.getByRole("textbox", {
            name: `Search, enter a URL, or ask ${job.galleryMascot}`,
          });
          await textbox.fill(job.prompt);
          await textbox.press(
            process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
          );
        } else if (start) {
          await chrome.getByRole("button", { name: "Show Berry" }).click();
          textbox = chrome
            .getByRole("complementary", { name: "Berry" })
            .getByRole("textbox", { name: "Message" });
          await textbox.fill(job.prompt);
          await textbox.press("Enter");
        } else {
          textbox = chrome.getByRole("textbox", {
            name: "Search, enter a URL, or ask Berry",
          });
          await textbox.fill(job.prompt);
          await textbox.press(
            process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
          );
        }

        const started = Date.now();
        const chatId = async () =>
          (await chrome.evaluate(() => window.chromeAPI.library.getLibrary()))
            .chats?.[0]?.id;
        let id: string | undefined;
        let endedBy: RunRecord["endedBy"] = "finished";
        let calls: ModelCall[] = [];
        let firstError: string | null = null;
        for (;;) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          id ??= await chatId();
          if (!id) continue;
          calls = await readCalls(app);
          const thread = await threadOf(chrome, id);
          const ended =
            thread &&
            thread.partial === null &&
            thread.messages.at(-1)?.role === "assistant";
          if (ended || thread?.error) {
            if (!job.keepGoing || firstError || !thread?.error) break;
            firstError = thread.error;
            await textbox.fill(job.keepGoing);
            await textbox.press("Enter");
            await new Promise((resolve) => setTimeout(resolve, 2_000));
            continue;
          }
          // Nobody's there to answer a question, and Skip is what tells Berry so.
          if (thread?.approval?.question) {
            await chrome.evaluate(
              ({ chat, approval }) =>
                window.chromeAPI.chat.decide(chat, approval, false),
              { chat: id, approval: thread.approval.id },
            );
          }
          // Nobody's there to take a page over either, so a handoff ends the run rather than waiting out the timeout.
          const handedOver = Boolean(thread?.approval?.handoff);
          const overBudget = spent() + costOf(calls) >= BUDGET_USD;
          if (handedOver || overBudget || Date.now() - started > JOB_TIMEOUT_MS) {
            endedBy = handedOver ? "handoff" : overBudget ? "budget" : "timeout";
            await chrome.evaluate(
              (chat) => window.chromeAPI.chat.stop(chat),
              id,
            );
            await new Promise((resolve) => setTimeout(resolve, 2_000));
            break;
          }
        }
        const durationMs = Date.now() - started;
        // The usage arrives as the response finishes being read, a moment after the reply ends.
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        calls = await readCalls(app);

        const thread = id ? await threadOf(chrome, id) : null;
        const { page, rendering } = await endPage(app, chrome);
        let endState: unknown = null;
        let endUrl: string | null = null;
        const shot = `${DATE}/${job.id}-${RUN}.jpg`;
        if (page) {
          await page.waitForTimeout(500);
          endUrl = page.url();
          endState = await job
            .check?.(page)
            .catch((error) => `check failed: ${String(error).slice(0, 200)}`);
          await page
            .screenshot({
              path: join(RESULTS, shot),
              type: "jpeg",
              quality: 50,
              timeout: 15_000,
            })
            .catch(() => {});
        }

        const main = calls.filter((call) => !call.model.includes("luna"));
        const toolCalls = main.flatMap((call) => call.toolCalls);
        saveRun({
          job: job.id,
          ability: job.ability,
          run: RUN,
          endedBy: thread?.error ? "error" : endedBy,
          error: thread?.error ?? null,
          firstError,
          model: main[0]?.model ?? "",
          modelCalls: main.length,
          toolCalls: toolCalls.length,
          tools: toolCalls.map(({ name, args }) =>
            `${name} ${args}`.slice(0, 160),
          ),
          lastToolResults: main.flatMap((call) => call.toolResults).slice(-6),
          peakInputTokens: Math.max(0, ...main.map((call) => call.inputTokens)),
          inputTokens: calls.reduce(
            (total, call) => total + call.inputTokens,
            0,
          ),
          cachedTokens: calls.reduce(
            (total, call) => total + call.cachedTokens,
            0,
          ),
          outputTokens: calls.reduce(
            (total, call) => total + call.outputTokens,
            0,
          ),
          costUsd: costOf(calls),
          durationMs,
          answer:
            thread?.messages.at(-1)?.role === "assistant"
              ? (thread.messages.at(-1)?.content ?? "")
              : "",
          steps: (thread?.messages.at(-1)?.steps ?? []).map(
            (step) => step.text,
          ),
          endUrl,
          endState:
            job.id === "prompt-injection"
              ? { pwnedHits: [...fixtures.hits] }
              : endState,
          rendering,
          refused: await readRefused(app),
          screenshot: existsSync(join(RESULTS, shot)) ? shot : null,
        });
      } finally {
        await app.close();
      }
    });
  }

  // Run on its own with `pnpm run eval -g "write report"`, after scoring.
  test("write report", () => {
    writeReport(RESULTS, DATE);
  });
});
