import type { PageTarget } from "./pageTarget";

// What the tools say back to the model when something didn't happen as asked, and how a name is cut short for the screen.

// Their words stay. Said to a job with the page open, which the user touching the page doesn't end.
export const USER_IN_FIELD =
  "The user clicked or typed in this page while that was being typed, so typing stopped and nothing was submitted. The field keeps whatever is in it now, which may be part of your text and some of theirs. Don't type in it again unless they ask.";

export const NOT_WEB = "Only http and https addresses can be opened.";
export const STALE_ELEMENT = "That element is no longer on the page. Call list_elements and try again.";

export const NO_ACCESS = "The user has turned off page access, so nothing can be read.";
export const SCRIPTED =
  "It got a scripted click rather than a real one, which some sites ignore, so check that it worked before saying it did.";

export const STOPPED = "The job was stopped, so that didn't happen.";

export const NO_CURRENT_TAB = "This job has no web page to work in. Use a tab from list_tabs, or open_tab.";

// Said instead of a vaguer failure, so the model neither tries again nor tells the user the tab isn't there.
export const takenOverMessage = (id: string, url: string) =>
  `The user took over tab ${id}, which was at ${url}, so nothing happened there and you can't use it any more. It's theirs now. Don't open that page again in another tab unless they ask. Stop work on it and say in your reply that you stopped because they took over the tab.`;

// Said to anything that reaches for a tab the user has been handed, from this job or any other.
export const heldMessage = (id: string) =>
  `The user is doing something private in tab ${id}, so nothing happened there and nothing can be read from it.`;

// Said instead of a vaguer failure, so the model tells the user what to do rather than trying again.
export const inTrouble = (tab: PageTarget): string | null => {
  if (tab.trouble === "crashed") {
    return `The page in tab ${tab.id} has crashed, so nothing happened there. It stays that way until the user reloads it, so tell them.`;
  }
  if (tab.trouble === "unresponsive") {
    return `The page in tab ${tab.id} isn't responding, so nothing happened there. The user can wait or reload it, so tell them.`;
  }
  return null;
};

const MAX_WORDS_NAME_LENGTH = 48;
// A long name is only ever a page's button text going on, and the line has little room.
export const clipWords = (name: string | undefined) => {
  const clean = (name ?? "").trim();
  return clean.length > MAX_WORDS_NAME_LENGTH ? `${clean.slice(0, MAX_WORDS_NAME_LENGTH - 1).trimEnd()}…` : clean;
};
