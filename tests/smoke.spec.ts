import { errors, expect, test } from "@playwright/test";
import { closeWithin, findView, killApp, launchApp, retryStuckLaunch } from "./app";

test("the built app renders its sidebar, toolbar and chat", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
    await expect(chrome.getByRole("button", { name: "Address" })).toBeVisible();

    await chrome.evaluate(() => window.chromeAPI.browser.createTab("about:blank"));
    await chrome.getByRole("button", { name: "Show Berry" }).click();
    await expect(chrome.getByPlaceholder("Ask Berry", { exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});

test("a stuck launch gets one more try, and other failures get none", async () => {
  const failing = (error: Error, ...then: string[]) => {
    let calls = 0;
    return {
      launch: async () => {
        if (calls++ === 0 || then.length === 0) throw error;
        return then[0];
      },
      calls: () => calls,
    };
  };
  const stuck = new errors.TimeoutError("electron.launch: Timeout exceeded");

  const recovers = failing(stuck, "app");
  expect(await retryStuckLaunch(recovers.launch)).toBe("app");
  expect(recovers.calls()).toBe(2);

  const staysStuck = failing(stuck);
  await expect(retryStuckLaunch(staysStuck.launch)).rejects.toBe(stuck);
  expect(staysStuck.calls()).toBe(2);

  const broken = failing(new Error("no such file"));
  await expect(retryStuckLaunch(broken.launch)).rejects.toThrow("no such file");
  expect(broken.calls()).toBe(1);
});

test("an app that won't quit is killed, and one that quits is left alone", async () => {
  let kills = 0;
  await closeWithin(async () => {}, () => kills++, 1000);
  expect(kills).toBe(0);

  const app = await launchApp();
  const exited = new Promise((resolve) => app.process().once("exit", resolve));
  await closeWithin(() => new Promise(() => {}), () => killApp(app), 10);
  await exited;
  expect(app.process().exitCode !== null || app.process().signalCode !== null).toBe(true);
});
