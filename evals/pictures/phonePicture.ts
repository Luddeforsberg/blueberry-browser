import { chromium, type Browser } from "@playwright/test";
import { join } from "node:path";
import { MascotStore } from "../../src/main/mascots/MascotStore";
import { mascotSnapshot } from "../../src/main/remoteJobs/cloudJobs";
import type { ChatStep } from "../../src/shared/library";
import { BERRY } from "../../src/shared/mascots";
import { sharedMascotRows } from "../../src/shared/phone";
import { drivePhone, LIVE } from "../../tests/features/phone";
import { savePicture } from "./founderApp";

// The phone page in site/app/, as tests/features/phone.ts serves it against the fake Supabase, at a phone's 3 pixels to a
// point. Only this computer runs it, so the runner's side is played by its own calls: the founder's hiring job, with the
// steps and the question Berry really asked in the approval picture, now waiting in the cloud. The live view shows the
// real page that job was on, as a browser here sees it.
const PHONE_SCALE = 3;
const LIVE_SIZE = { width: 1280, height: 800 };

export interface Asked {
  prompt: string;
  text: string;
  steps: ChatStep[];
}

// The page the approval names, as its exact words end with it.
const livePage = async (browser: Browser, text: string): Promise<string> => {
  const url = /https:\/\/\S+/.exec(text)?.[0];
  if (!url) throw new Error("The approval names no page");
  const page = await browser.newPage({ viewport: LIVE_SIZE });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(2_000);
  const shot = await page.screenshot();
  await page.close();
  return `<!doctype html><style>body{margin:0}img{display:block;width:100%}</style><img alt="" src="data:image/png;base64,${shot.toString("base64")}">`;
};

export async function phonePicture(profile: string, asked: Asked, name: string): Promise<void> {
  const flock = new MascotStore(join(profile, "mascots.json")).all();
  // Any page can write WebP, so a browser of its own does it here, as the app's chrome view does for the window.
  const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
  try {
    const { png } = await drivePhone(
      async (phone) => {
        await phone.owner("sync_cloud_mascots", { p_mascots: sharedMascotRows(flock) });
        const job = await phone.owner("start_cloud_job", {
          p_prompt: asked.prompt,
          p_history: [],
          p_mascot: mascotSnapshot(BERRY),
          p_action_approval: "risky",
          p_context_id: "ctx-founder",
        });
        await phone.runner("runner_claim_job");
        const steps = asked.steps.map(({ text, kind }) => ({ text, done: true, kind }));
        await phone.runner("runner_update_job", { p_job: job, p_steps: steps, p_live_view: LIVE });
        await phone.runner("runner_ask", { p_job: job, p_kind: "approval", p_text: asked.text });
        await phone.settleTimes();
        await phone.signIn();
        await phone.page.getByRole("dialog", { name: /^Berry wants to/ }).waitFor();
      },
      "light",
      Date.now(),
      { scale: PHONE_SCALE, livePage: await livePage(browser, asked.text) },
    );
    await savePicture(await browser.newPage(), name, png);
  } finally {
    await browser.close();
  }
}
