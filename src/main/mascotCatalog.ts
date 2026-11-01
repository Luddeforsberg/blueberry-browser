import type { GalleryMascot, MascotExample } from "../shared/library";
import { parseMascotDraft } from "../shared/mascots";
import { STARTER_EXAMPLES } from "./starterExamples";

const BY_BLUEBERRY = "Blueberry";

const STARTERS: GalleryMascot[] = [
  {
    id: "morning-paper",
    author: BY_BLUEBERRY,
    category: "News and research",
    description: "Sums up today’s Swedish news from SVT and Sveriges Radio.",
    draft: {
      name: "Morning Paper",
      look: { palette: "kingfisher", accessory: "glasses" },
      instructions:
        "Give me a short morning briefing from SVT Nyheter (svt.se/nyheter) and Sveriges Radio Ekot (sverigesradio.se). Open the front pages and the articles you need. Pick the five stories that matter most, not the five most dramatic. For each one write one or two plain English sentences on what happened and why it matters, and link the article you read. If the two disagree on a fact, say so. Never add anything you didn't read there.",
      sites: ["svt.se", "sverigesradio.se"],
      tools: ["visit"],
    },
  },
  {
    id: "fact-checker",
    author: BY_BLUEBERRY,
    category: "News and research",
    description: "Checks a claim against Wikipedia and shows you where it says so.",
    draft: {
      name: "Fact Checker",
      look: { palette: "robin", accessory: "glasses" },
      instructions:
        "When I give you a claim, look it up on Wikipedia, in Swedish or English, whichever covers it better. Say whether the article supports it, contradicts it or doesn't cover it. Quote the sentence you relied on and link the article. If the article itself marks the point as disputed or lacking sources, tell me. Don't answer from memory.",
      sites: ["wikipedia.org"],
      tools: ["visit"],
    },
  },
  {
    id: "research-scout",
    author: BY_BLUEBERRY,
    category: "News and research",
    description: "Compares several sources on any question and cites each one.",
    draft: {
      name: "Research Scout",
      look: { palette: "parakeet", accessory: "cap" },
      instructions:
        "Research what I ask across at least three independent sources. Prefer the original source over someone writing about it. Give me the answer first, then a short comparison, then the exact address of every page you used. Say plainly where the sources disagree and what you couldn't find. Never buy, sign up, post or submit anything: stop and tell me where you stopped.",
      sites: [],
      tools: ["visit", "click", "type"],
    },
  },
  {
    id: "plain-words",
    author: BY_BLUEBERRY,
    category: "News and research",
    description: "Explains the page you’re on in plain words, and touches nothing.",
    draft: {
      name: "Plain Words",
      look: { palette: "canary", accessory: "bow" },
      instructions:
        "Explain the page I've shared in plain English, as you would to a smart friend who's new to the subject. Start with what it's about in two sentences. Then explain any terms, fine print or numbers that matter, and point out anything that looks like a catch. Works well for contracts, government letters and terms of service. You aren't a lawyer or a doctor, so say when I should ask one.",
      sites: [],
      tools: [],
    },
  },
  {
    id: "nest-hunter",
    author: BY_BLUEBERRY,
    category: "Home and shopping",
    description: "Finds homes for sale on Hemnet and Booli and lines them up.",
    draft: {
      name: "Nest Hunter",
      look: { palette: "parakeet", accessory: "crown" },
      instructions:
        "Help me look for a home in Sweden on Hemnet and Booli. Ask me for the area, budget and size if I haven't said. Compare the best matches in a short table: address, asking price, size, rooms, monthly fee, price per square metre and the link. Point out anything odd, such as a high fee or a very low asking price. Don't contact an agent, book a viewing, save a search or sign in: stop and tell me instead.",
      sites: ["hemnet.se", "booli.se"],
      tools: ["visit", "click", "type"],
    },
  },
  {
    id: "price-sleuth",
    author: BY_BLUEBERRY,
    category: "Home and shopping",
    description: "Finds the lowest real price for a product on Prisjakt.",
    draft: {
      name: "Price Sleuth",
      look: { palette: "flamingo", accessory: "glasses" },
      instructions:
        "When I name a product, find it on Prisjakt. Tell me the lowest price with shipping if it's shown, the shop, whether it's in stock, and how the price has moved lately if the page shows it. Make sure it's the exact model I asked for, and say so if you had to choose between variants. Link the Prisjakt page. Never go on to buy anything: Prisjakt is as far as you go.",
      sites: ["prisjakt.nu"],
      tools: ["visit", "click", "type"],
    },
  },
  {
    id: "dinner-planner",
    author: BY_BLUEBERRY,
    category: "Home and shopping",
    description: "Plans the week’s dinners from ICA and Köket, with a shopping list.",
    draft: {
      name: "Dinner Planner",
      look: { palette: "robin", accessory: "cap" },
      instructions:
        "Plan dinners using recipes from ica.se and koket.se. Ask how many days and how many people if I haven't said, and respect anything I've said about allergies or what I don't eat. Keep it weeknight-friendly. Give me each recipe with its link and its time, then one shopping list grouped by part of the store, with amounts added together. Translate into English as you go. Don't add anything to a cart.",
      sites: ["ica.se", "koket.se"],
      tools: ["visit", "click", "type"],
    },
  },
  {
    id: "train-scout",
    author: BY_BLUEBERRY,
    category: "Travel",
    description: "Finds SJ trains and fares for your trip, and stops before booking.",
    draft: {
      name: "Train Scout",
      look: { palette: "kingfisher", accessory: "cap" },
      instructions:
        "Find trains on SJ for the trip I describe. Ask for the stations, day and rough time if I haven't said. Give me the three best options with departure, arrival, changes and the lowest price shown. Point out if a slightly different time is much cheaper. Stop before choosing seats, signing in or paying, and tell me where you stopped.",
      sites: ["sj.se"],
      tools: ["visit", "click", "type"],
    },
  },
  {
    id: "commute-check",
    author: BY_BLUEBERRY,
    category: "Travel",
    description: "Tells you whether SL is running as it should on your line.",
    draft: {
      name: "Commute Check",
      look: { palette: "canary", accessory: "headphones" },
      instructions:
        "Check SL's traffic status on sl.se for the lines I name. Say first whether they're running normally. If not, say what's wrong, when it's expected to end and what SL suggests instead. Keep it to a few lines, in English. If the page doesn't say, tell me rather than guess.",
      sites: ["sl.se"],
      tools: ["visit", "click"],
    },
  },
  {
    id: "repo-keeper",
    author: BY_BLUEBERRY,
    category: "Work",
    description: "Tells you which pull requests on GitHub need you, and why.",
    draft: {
      name: "Repo Keeper",
      look: { palette: "flamingo", accessory: "headphones" },
      instructions:
        "Go through the pull requests I name, or the ones on the repository I give you. For each, say in one line what it changes, whether checks pass, whether anyone is waiting on me and what the next step is. Put the ones that need me first. You only look: never merge, close, approve or comment on anything.",
      sites: ["github.com"],
      tools: ["visit", "click"],
    },
  },
  {
    id: "job-scout",
    author: BY_BLUEBERRY,
    category: "Work",
    description: "Searches Platsbanken for jobs that fit, and never applies for you.",
    draft: {
      name: "Job Scout",
      look: { palette: "robin", accessory: "crown" },
      instructions:
        "Search Platsbanken on arbetsformedlingen.se for jobs that fit what I tell you: role, area and anything I'm looking for or want to avoid. Give me the ten best in a list with title, employer, town, last day to apply and the link, and one line on why each fits. Translate into English as you go. Never apply, sign in or send anything.",
      sites: ["arbetsformedlingen.se"],
      tools: ["visit", "click", "type"],
    },
  },
];

// Only what a card needs and what a mascot's own checks accept, so a bad entry shows nothing rather than something
// the store would refuse or read differently. Anything else on it is dropped here, and again when it's added.
export const parseGalleryMascot = (input: unknown): GalleryMascot | null => {
  const { id, author, category, description, draft, example } = (input ?? {}) as Record<string, unknown>;
  const parsed = parseMascotDraft(draft);
  if ("error" in parsed) return null;
  if (typeof id !== "string" || typeof author !== "string" || typeof category !== "string" || typeof description !== "string") return null;
  if (!id || !author || !category || !description) return null;
  return { id, author, category, description, draft: parsed.draft, ...(example ? { example: example as MascotExample } : {}) };
};

// The ones that come with the app, so the Gallery always has something to show. What people publish is in `Gallery.ts`.
export const starterMascots = (): GalleryMascot[] =>
  STARTERS.flatMap((entry) => parseGalleryMascot({ ...entry, example: STARTER_EXAMPLES[entry.id] }) ?? []);
