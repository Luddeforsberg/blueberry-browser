import { chooseFromMenu, findView } from "../../app";
import type { Drive } from "../driver";
import type { Feature } from "../map";
import { createTab, threeTabs, someChats } from "./ways";

// The menu's answer is the row chosen, so nothing waits for it here.
const showChatMenu = (drive: Drive) =>
  drive.chrome.evaluate(async () => {
    const { chats } = await window.chromeAPI.library.getLibrary();
    const [first] = chats;
    if (!first) throw new Error("No chat");
    void window.chromeAPI.chat.showMenu(first.id, { x: 120, y: 160, width: 24, height: 24 });
  });

// A menu is drawn in the page first and placed by main after, so it's open once main shows its view.
const menuShows = async (drive: Drive, timeout?: number) => {
  const menu = await findView(drive.app, "view=menu");
  await menu
    .locator('[role=menu]:not([aria-hidden="true"]), [role=alertdialog]')
    .filter({ visible: true })
    .first()
    .waitFor(timeout === undefined ? {} : { timeout });
  await viewShows(drive, "view=menu", timeout);
};

// A view over the window is on screen: main shows it and gives it room.
const viewShows = async (drive: Drive, urlPart: string, timeout = 10_000) => {
  const started = Date.now();
  while (
    !(await drive.app.evaluate(({ BaseWindow }, urlPart) => {
      const view = BaseWindow.getAllWindows()
        .flatMap((window) => window.contentView.children)
        .find(
          (child): child is Electron.WebContentsView =>
            "webContents" in child && (child as Electron.WebContentsView).webContents.getURL().includes(urlPart),
        );
      return !!view && view.getVisible() && view.getBounds().width > 1;
    }, urlPart))
  ) {
    if (Date.now() - started > timeout) throw new Error(`${urlPart} never showed`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

const ACCOUNT = { email: "alex@example.com", password: "correct horse battery" };

// The account menu's button: a person with a server, Settings and more without one, in the sidebar or the toolbar.
const openAccountMenu = async (drive: Drive) => {
  await drive.chrome
    .getByRole("button", { name: /^(Settings and more|Account, )/ })
    .first()
    .click();
  const where = drive.look.layout === "horizontal" ? await findView(drive.app, "view=overlay") : drive.chrome;
  await where.getByRole("dialog", { name: "Account" }).waitFor();
  if (drive.look.layout === "horizontal") await viewShows(drive, "view=overlay");
};

// The browser window around the page: the sidebar, the tab row, the toolbar and what opens over them.
export const windowFeatures: Feature[] = [
  {
    name: "sidebar",
    design: "Sidebar",
    layouts: "vertical",
    states: {
      tabs: { open: threeTabs },
      chats: {
        open: async (drive) => {
          await someChats(drive);
          await drive.chrome.getByRole("tab", { name: /^Chats/ }).click();
          await drive.chrome.getByRole("tabpanel", { name: "Chats" }).getByText("Lisbon weekend").waitFor();
        },
      },
      collapsed: {
        open: async (drive) => {
          await threeTabs(drive);
          await drive.chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
          await drive.chrome.getByRole("navigation", { name: "Sidebar" }).waitFor({ state: "detached" });
        },
      },
      floating: {
        open: async (drive) => {
          await threeTabs(drive);
          await drive.chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
          await drive.chrome.evaluate(() => window.chromeAPI.layout.showFloatingSidebar());
          const overlay = await findView(drive.app, "view=overlay");
          await overlay.getByRole("navigation", { name: "Sidebar" }).waitFor();
          await viewShows(drive, "view=overlay");
        },
      },
    },
  },
  {
    name: "tab-row",
    design: "Horizontal layout",
    layouts: "horizontal",
    states: {
      tabs: { open: threeTabs },
    },
  },
  {
    name: "account-menu",
    design: "The account menu",
    layouts: "both",
    states: {
      "no-server": { open: openAccountMenu },
      "signed-in": {
        needs: { supabase: true },
        open: async (drive) => {
          await drive.supabase!.addAccount(ACCOUNT.email, ACCOUNT.password);
          await drive.chrome.evaluate(({ email, password }) => window.chromeAPI.account.signIn(email, password), ACCOUNT);
          await drive.chrome.getByRole("button", { name: `Account, ${ACCOUNT.email}` }).waitFor();
          await openAccountMenu(drive);
        },
      },
    },
  },
  {
    name: "site-permission",
    design: "11. Not redrawn yet",
    layouts: "both",
    states: {
      notifications: {
        open: async (drive) => {
          await createTab(drive, drive.site.url("alerts.example", "/notify"));
          const prompt = await findView(drive.app, "view=prompt");
          await prompt.getByRole("button", { name: "Allow", exact: true }).waitFor();
          await viewShows(drive, "view=prompt");
        },
      },
    },
  },
  {
    name: "address-field",
    design: "Toolbar and the address field",
    layouts: "both",
    states: {
      page: { open: (drive) => createTab(drive, drive.site.url("shop.example")).then(() => undefined) },
      suggestions: {
        open: async (drive) => {
          await threeTabs(drive);
          await drive.chrome.getByRole("button", { name: "Address" }).click();
          await drive.chrome.getByRole("textbox", { name: "Address" }).pressSequentially("lis");
          const list = await findView(drive.app, "view=suggestions");
          await list.getByRole("option").first().waitFor();
          await list
            .getByRole("option")
            .last()
            .getByText(/Ask Berry/)
            .waitFor();
          await viewShows(drive, "view=suggestions");
        },
      },
    },
  },
  {
    name: "tab-preview",
    design: "8. Component states",
    layouts: "both",
    states: {
      card: {
        open: async (drive) => {
          await threeTabs(drive);
          const tab = drive.chrome
            .getByRole("list", { name: "Tabs", exact: true })
            .getByRole("button", { name: "Lisbon fares", exact: true });
          await tab.hover();
          const preview = await findView(drive.app, "view=preview");
          await preview.locator("[data-tab-preview]").getByText("Lisbon fares").waitFor();
          await preview.locator("[data-tab-preview] img").first().waitFor();
          await viewShows(drive, "view=preview");
        },
      },
    },
  },
  {
    name: "find-bar",
    design: "11. Not redrawn yet",
    layouts: "both",
    states: {
      matches: {
        open: async (drive) => {
          await createTab(drive, drive.site.url("birds.example", "/birds"));
          await drive.app.evaluate(({ Menu }) => {
            const search = (items: Electron.MenuItem[]): Electron.MenuItem | undefined =>
              items.flatMap((item) => (item.submenu ? [search(item.submenu.items)] : item.label === "Find…" ? [item] : []))[0];
            (Menu.getApplicationMenu()?.items ?? [])
              .map((top) => search(top.submenu?.items ?? []))
              .find(Boolean)
              ?.click();
          });
          const find = await findView(drive.app, "view=find");
          await find.getByRole("textbox", { name: "Find in page" }).fill("jackdaw");
          await find.getByText("1 of 3").waitFor();
          await viewShows(drive, "view=find");
        },
      },
    },
  },
  {
    name: "menus",
    design: "8. Component states",
    layouts: "both",
    states: {
      "app-menu": {
        open: async (drive) => {
          await drive.chrome.evaluate(() => window.chromeAPI.layout.showAppMenu());
          await menuShows(drive);
        },
        offMac: true,
      },
      "chat-menu": {
        open: async (drive) => {
          await someChats(drive);
          if (drive.look.layout === "vertical") await drive.chrome.getByRole("tab", { name: /^Chats/ }).click();
          await showChatMenu(drive);
          await menuShows(drive);
        },
      },
      "choose-mascot": {
        open: async (drive) => {
          await drive.chrome.getByRole("button", { name: /^Asking Berry/ }).click();
          await drive.chrome.getByRole("menu", { name: "Choose who to ask" }).waitFor();
        },
      },
      "asking-first": {
        open: async (drive) => {
          await someChats(drive);
          await showChatMenu(drive);
          await menuShows(drive);
          await chooseFromMenu(drive.app, "Delete…");
          const menu = await findView(drive.app, "view=menu");
          await menu.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).waitFor();
        },
      },
      "page-menu": {
        open: async (drive) => {
          const page = await createTab(drive, drive.site.url("shop.example"));
          // A right-click as the page is still settling in can be lost, so it's tried again, as a person would.
          for (let tries = 0; ; tries++) {
            await page.mouse.click(300, 300, { button: "right" });
            const shown = await menuShows(drive, 2_000).then(
              () => true,
              () => false,
            );
            if (shown) break;
            if (tries === 3) throw new Error("The page's menu didn't open");
          }
        },
      },
    },
    needs: { starters: true },
  },
];
