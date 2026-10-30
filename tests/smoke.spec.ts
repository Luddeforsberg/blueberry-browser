import { expect, test } from "@playwright/test";
import { findView, launchApp } from "./app";

test("the built app renders its top bar and sidebar", async () => {
  const app = await launchApp();
  try {
    const topBar = await findView(app, "topbar/index.html");
    await expect(topBar.locator("#root > *").first()).toBeVisible();

    const sidebar = await findView(app, "sidebar/index.html");
    await expect(sidebar.getByPlaceholder("Send a message...")).toBeVisible();
  } finally {
    await app.close();
  }
});
