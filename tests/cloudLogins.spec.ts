// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

// Bringing a sign-in into the cloud, with a headless Chrome on this computer standing in for Browserbase.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.BLUEBERRY_SHOTS ?? join(homedir(), "blueberry-audit", "shots-cloud-logins");
const SECRET = "cookie-value-that-must-stay-put";

const shoot = async (chrome: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  await chrome.screenshot({ path: join(SHOTS, `${name}.png`) });
};

test.skip(process.platform !== "darwin" || !existsSync(CHROME), "Needs Google Chrome");

test("a site's sign-in comes into the cloud after confirming, can be taken out, and a cloud job hands a page to the user", async () => {
  test.setTimeout(90_000);
  // Every request the site gets, with whether it carried the session and whether the cloud's headless Chrome sent it.
  const seen: { cloud: boolean; signedIn: boolean; path: string }[] = [];
  const server = createServer((request, response) => {
    const signedIn = (request.headers.cookie ?? "").includes(`sid=${SECRET}`);
    seen.push({ cloud: /HeadlessChrome/.test(request.headers["user-agent"] ?? ""), signedIn, path: request.url ?? "" });
    response.setHeader("content-type", "text/html");
    if (request.url === "/login") response.setHeader("set-cookie", `sid=${SECRET}; HttpOnly; Path=/; Max-Age=3600`);
    response.end(`<!doctype html><title>Site</title><h1>${signedIn || request.url === "/login" ? "Signed in as Ludde" : "Signed out"}</h1>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const site = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const lastCloudVisit = () => seen.filter((one) => one.cloud).at(-1);
  const model = await startFakeModel();
  const profile = mkdtempSync(join(tmpdir(), "blueberry-test-"));
  const app = await launchApp(profile, {
    modelEnv: { ...model.env, BLUEBERRY_CLOUD_LOCAL: "1", BLUEBERRY_CLOUD_CHROME: CHROME, BLUEBERRY_CLOUD_CONFIRM: "allow" },
  });
  try {
    const chrome = await findView(app, "view=chrome");

    // 1. Signed in, in a tab of Blueberry's own.
    await chrome.evaluate((url) => window.chromeAPI.browser.createTab(`${url}login`), site);
    await expect.poll(() => seen.some((one) => !one.cloud && one.path === "/login")).toBe(true);

    // 2. Brought along from Settings, which opens it in a cloud tab in front.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Cloud" }));
    await expect(chrome.getByRole("heading", { name: "Signed in to" })).toBeVisible();
    await shoot(chrome, "settings-signed-in-to-empty");
    await chrome.getByRole("textbox", { name: "Site to bring along" }).fill(site);
    await chrome.getByRole("button", { name: "Bring along", exact: true }).click();

    // 3. The cloud browser is signed in there.
    await expect(chrome.getByText("Are you signed in to 127.0.0.1 here?", { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => lastCloudVisit()?.signedIn).toBe(true);
    await expect(chrome.getByRole("img", { name: /Picture of/ })).toBeVisible({ timeout: 10_000 });
    await shoot(chrome, "cloud-tab-check");
    await chrome.getByRole("button", { name: "Yes, I’m signed in" }).click();
    await expect(chrome.getByText("Saved in Settings > Cloud.", { exact: false })).toBeVisible();
    const checkTab = (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => tab.page === "cloud" && tab.isActive)!;

    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Cloud" }));
    const list = chrome.getByRole("list", { name: "Sites signed in in the cloud" });
    await expect(list.getByText("127.0.0.1", { exact: true })).toBeVisible();
    await expect(list.getByText(/Checked by you/)).toBeVisible();
    await shoot(chrome, "settings-signed-in-to");

    // The value went nowhere but the cloud browser: not to the chrome, and not to the list on disk.
    expect(JSON.stringify(await chrome.evaluate(() => window.chromeAPI.cloud.state()))).not.toContain(SECRET);
    const saved = readFileSync(join(profile, "cloud-logins.json"), "utf8");
    expect(saved).not.toContain(SECRET);
    expect(saved).not.toContain("sid");

    // 4. Taken out, and the open check tab loads again, signed out.
    const visits = seen.length;
    await list.getByRole("button", { name: "Remove" }).click();
    await expect(list).toHaveCount(0);
    await expect.poll(() => seen.slice(visits).filter((one) => one.cloud).at(-1)?.signedIn, { timeout: 10_000 }).toBe(false);
    expect((await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).some((tab) => tab.id === checkTab.id)).toBe(true);

    // 5. A job in the cloud asks for a sign-in, and carries on once the user says they're done.
    model.callTools({ name: "open_tab", args: { url: `${site}account` } });
    model.callTools({ name: "hand_to_user", args: { need: "sign-in" } });
    model.replyWith("Carried on");
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Check my account", { seePage: false, cloud: true }));
    expect(sent).not.toBeNull();
    await expect(chrome.getByRole("button", { name: /Needs you.*1 waiting/ })).toBeVisible({ timeout: 20_000 });
    const waiting = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).needsYou[0];
    expect(waiting.approval.handoff).toMatchObject({ need: "sign-in", site: "127.0.0.1" });
    // It points at the cloud tab, so Go to the tab works.
    expect(waiting.tabId).not.toBeNull();
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), waiting.tabId!);
    await expect(chrome.getByText(/needs you here\. Take over to do it in the page/)).toBeVisible();
    await shoot(chrome, "cloud-tab-handoff");
    await chrome.getByRole("button", { name: "Take over" }).click();
    await expect(chrome.getByText(/press I’m done and .* carries on/)).toBeVisible();
    // Nothing went to the model while it waited.
    const asked = model.requests.length;
    await chrome.getByRole("button", { name: "I’m done" }).first().click();

    await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id))?.messages.at(-1)?.content, { timeout: 15_000 }).toBe("Carried on");
    expect(model.requests.length).toBe(asked + 1);
    expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("The user says they're done");
    // The job has the page again, so its strip offers Take over once more.
    await expect(chrome.getByRole("button", { name: "Take over" })).toBeVisible();
  } finally {
    await app.close();
    model.close();
    server.close();
  }
});
