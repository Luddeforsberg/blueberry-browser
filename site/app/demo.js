// Made-up data for the sample screens, so the look can be agreed before anything reads Supabase. Goes when it does.

const el = (tag, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const put = (parent, ...children) => {
  parent.append(...children);
  return parent;
};

const bar = (address) => put(el("div", "bar"), el("span", "", address));

const flock = [
  { id: "berry", name: "Berry", look: { palette: "jackdaw", accessory: "none" }, sites: [], tools: ["visit", "click", "type"] },
  { id: "scout", name: "Scout", look: { palette: "robin", accessory: "cap" }, sites: ["webhallen.com", "prisjakt.nu"], tools: ["visit", "click", "type"] },
  { id: "penny", name: "Penny", look: { palette: "canary", accessory: "glasses" }, sites: ["linkedin.com"], tools: ["visit", "click"] },
  { id: "pip", name: "Pip", look: { palette: "kingfisher", accessory: "headphones" }, sites: [], tools: ["visit"] },
  { id: "rosa", name: "Rosa", look: { palette: "flamingo", accessory: "bow" }, sites: ["sj.se"], tools: ["visit", "click", "type"] },
];
const [berry, scout, penny, pip] = flock;

export const DEMO = {
  email: "you@example.com",
  flockShared: "10 minutes ago",
  flock,
  jobs: [
    {
      screen: "approval",
      status: "waiting",
      mascot: scout,
      title: "A USB-C cable",
      when: "4 min ago",
      prompt: "Find a USB-C cable under 150 kr on Webhallen, at least 2 m and 100 W, and put the best one in my cart.",
      steps: [
        { text: "Opened webhallen.com", done: true },
        { text: "Searched for “usb-c kabel 2m”", done: true },
        { text: "Compared 14 cables by price, length and reviews", done: true },
        { text: "Waiting for you to allow adding one to the cart", done: false },
      ],
      ask: {
        kind: "approval",
        sentence: "Scout wants to add a cable to your cart on webhallen.com",
        exactly: "Click “Add to cart” on “Deltaco USB-C to USB-C cable, 2 m, 100 W, black” for 99 kr at https://www.webhallen.com/se/product/338190-Deltaco-USB-C-USB-C-2m-100W",
      },
      page: "shop",
      live: "webhallen.com",
    },
    {
      screen: "handoff",
      status: "waiting",
      mascot: penny,
      title: "Who viewed my profile",
      when: "12 min ago",
      prompt: "Check who viewed my LinkedIn profile this week and tell me if anyone works at a company I’ve applied to.",
      steps: [
        { text: "Opened linkedin.com", done: true },
        { text: "Waiting for you to sign in", done: false },
      ],
      ask: { kind: "handoff", need: "sign-in", site: "linkedin.com" },
      page: "login",
      live: "linkedin.com",
    },
    {
      screen: "job",
      status: "running",
      mascot: pip,
      title: "Railway’s pricing",
      when: "1 min ago",
      prompt: "Read the three newest posts on Railway’s blog and tell me if anything changed for the Hobby plan.",
      steps: [
        { text: "Opened blog.railway.com", done: true },
        { text: "Read “Railway’s November changelog”", done: true },
        { text: "Reading “Usage-based pricing, one year in”", done: false },
      ],
      page: "article",
      live: "blog.railway.com",
    },
    {
      screen: "list",
      status: "done",
      mascot: berry,
      when: "09:40",
      prompt: "Which pharmacies near Medborgarplatsen are open after 22 on Sunday?",
      steps: [{ text: "Searched three pharmacy sites", done: true }],
      reply: "Two are: Apotek Hjärtat at Medborgarplatsen until 23, and Apoteket C.W. Scheele by Centralen around the clock.",
    },
    {
      screen: "list",
      status: "failed",
      mascot: scout,
      when: "yesterday",
      prompt: "Book the cheapest SJ train to Göteborg on Friday after 16:00.",
      error: "Nobody answered in time, so it stopped there",
      steps: [{ text: "Found a 16:22 for 395 kr", done: true }],
    },
    {
      screen: "list",
      status: "stopped",
      mascot: berry,
      when: "yesterday",
      prompt: "Unsubscribe me from every newsletter in my Gmail promotions tab.",
      steps: [],
    },
  ],

  // What the live view shows on the sample screens: a stand-in for someone else's page.
  pages: {
    shop: () => {
      const items = put(el("div", "shop"),
        ...[["149 kr"], ["99 kr", true], ["129 kr"], ["179 kr"], ["119 kr"], ["139 kr"]].map(([price, pick]) =>
          put(el("div", `item ${pick ? "pick" : ""}`), el("div", "pic"), el("div", "line"), el("div", "line short"), el("div", "price", price))));
      return put(el("div", "page"), bar("webhallen.com/se/search?q=usb-c kabel 2m"), items);
    },
    login: () => {
      const form = put(el("div", "login"), el("b", "", "Sign in"), el("div", "in", "you@example.com"), el("div", "in", "••••••••••"), el("div", "go", "Sign in"));
      return put(el("div", "page"), bar("linkedin.com/login"), form);
    },
    article: () => {
      return put(el("div", "page"), bar("blog.railway.com/p/usage-based-pricing"),
        put(el("div", "login"), el("b", "", "Usage-based pricing, one year in"), el("div", "line"), el("div", "line"), el("div", "line short"), el("div", "line"), el("div", "line"), el("div", "line short")));
    },
  },
};
