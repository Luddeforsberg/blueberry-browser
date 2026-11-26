import { test } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Settings } from "../../src/shared/ipc";
import type { ChatThread } from "../../src/shared/library";
import { desktopPicture } from "./desktopPicture";
import { closeFounder, launchFounder, overBudget, pictureWindow, type Founder } from "./founderApp";
import { closeLeftovers, finished, loadEveryTab, openPage, pageOnly, PROMPTS, startChat, tabs, threadOf, until } from "./jobs";
import { jobFromClaudeCode } from "./mcpJob";
import { phonePicture, type Asked } from "./phonePicture";
import { seedFounder } from "./seedFounder";
import { showBerryHow } from "./showBerryHow";

// Every picture README.md shows, from one profile that grows as it goes: each real job leaves its chat in the sidebar for
// the pictures after it. PICTURES picks some by name, and PICTURES_PROFILE names the profile, which is seeded if it isn't
// there. See evals/README.md.
const PROFILE = process.env.PICTURES_PROFILE ?? join(tmpdir(), "blueberry-founder");
const ONLY = process.env.PICTURES?.split(",");
// What the approval asked, for the phone's picture of the same job.
const ASKED = join(PROFILE, "pictures-asked.json");

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!existsSync(PROFILE)) seedFounder(PROFILE);
});

const picture = (
  name: string,
  take: (founder: Founder) => Promise<void>,
  { real = false, settings = {} }: { real?: boolean; settings?: Partial<Settings> } = {},
) =>
  test(name, async () => {
    test.skip(!!ONLY && !ONLY.includes(name), "Not asked for");
    test.skip(real && overBudget(PROFILE), "Over budget");
    const founder = await launchFounder(PROFILE, { settings });
    const before = (await tabs(founder)).map(({ id }) => id);
    try {
      await take(founder);
    } finally {
      await closeLeftovers(founder, before);
      // A restored page in front holds up the next launch, so it ends as the seed does, on a new tab.
      await openPage(founder, "new-tab");
      await closeFounder(founder);
    }
  });

const working = (thread: ChatThread | null, steps: number) => !!thread && thread.partial !== null && thread.steps.length >= steps;
const workPicture = (founder: Founder) =>
  founder.chrome
    .getByRole("complementary", { name: "What it’s working on" })
    .locator("img")
    .first()
    .waitFor({ timeout: 3 * 60_000 });

picture("tabs", loadEveryTab);

picture(
  "working-view",
  async (founder) => {
    const id = await startChat(founder, PROMPTS.pricing);
    await until("the second site", async () => {
      const thread = await threadOf(founder, id);
      return working(thread, 3) && thread?.steps.some(({ text }) => /cliniko/i.test(text));
    });
    await workPicture(founder);
    await pictureWindow(founder, "working-view");
    await finished(founder, id);
  },
  { real: true },
);

picture(
  "approval",
  async (founder) => {
    const id = await startChat(founder, PROMPTS.hiring);
    const thread = await until("an approval", async () => {
      const thread = await threadOf(founder, id);
      if (thread && !thread.partial && thread.messages.at(-1)?.role === "assistant") throw new Error("It finished without asking");
      return thread?.approval && !thread.approval.question ? thread : null;
    });
    await founder.chrome.getByRole("region", { name: "Approval needed" }).first().waitFor();
    await pictureWindow(founder, "approval");
    writeFileSync(ASKED, JSON.stringify({ prompt: PROMPTS.hiring, text: thread.approval?.text, steps: thread.steps }));
    // Filters on a public job board, which she'd allow.
    await finished(founder, id, { allow: (text) => pageOnly(text) || text.includes("https://thehub.io/") });
  },
  { real: true },
);

picture(
  "cloud-chat",
  async (founder) => {
    const id = await startChat(founder, PROMPTS.changelog, { cloud: true });
    await until("a cloud page", async () => working(await threadOf(founder, id), 3));
    await workPicture(founder);
    await pictureWindow(founder, "cloud-chat");
    await finished(founder, id);
  },
  { real: true },
);

picture(
  "claude-code",
  async (founder) => {
    const id = await jobFromClaudeCode(founder, PROMPTS.seedGuide);
    await finished(founder, id);
    await openPage(founder, "chat", id);
    await founder.chrome.getByText("from Claude Code").first().waitFor();
    await pictureWindow(founder, "claude-code");
  },
  { real: true },
);

picture("show-berry-how", async (founder) => {
  await showBerryHow(founder);
  await pictureWindow(founder, "show-berry-how");
});

picture("gallery", async (founder) => {
  await openPage(founder, "mascot-gallery");
  await founder.chrome.getByRole("region", { name: "From Blueberry" }).getByRole("button").first().waitFor();
  await pictureWindow(founder, "gallery");
});

picture(
  "your-mascots",
  async (founder) => {
    await openPage(founder, "mascots");
    await founder.chrome.getByRole("button", { name: "New mascot" }).waitFor();
    await pictureWindow(founder, "your-mascots");
  },
  { settings: { appearance: "dark" } },
);

// Last of the windows, so the cheap model reads every chat before it.
picture(
  "new-tab",
  async (founder) => {
    await founder.chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await until("the model's suggestions", async () => {
      const file = join(PROFILE, "suggestions.json");
      return existsSync(file) && (JSON.parse(readFileSync(file, "utf8")) as { proposals: unknown[] }).proposals.length > 0;
    });
    await openPage(founder, "new-tab");
    await founder.chrome.getByText("Suggestions").first().waitFor();
    await pictureWindow(founder, "new-tab");
  },
  { real: true },
);

picture("desktop-berry", (founder) => desktopPicture(founder, "desktop-berry", "Prep me for Thursday's partner call with Physitrack"));

test("phone-approval", async () => {
  test.skip(!!ONLY && !ONLY.includes("phone-approval"), "Not asked for");
  await phonePicture(PROFILE, JSON.parse(readFileSync(ASKED, "utf8")) as Asked, "phone-approval");
});
