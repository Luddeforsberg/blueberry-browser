import { expect, test } from "@playwright/test";
import { findView, launchApp } from "./app";

test("the built app renders its sidebar, toolbar and chat", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "chrome/index.html");
    await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
    await expect(chrome.getByRole("button", { name: "Address" })).toBeVisible();

    await chrome.getByRole("button", { name: "Open chat" }).click();
    await expect(chrome.getByPlaceholder("Send a message...")).toBeVisible();
  } finally {
    await app.close();
  }
});
