// What a model might propose from the demo history in evals/seedHistory.ts: cards citing the digest's real ids, and
// ones that must never get past the checks.
interface Session {
  id: string;
  pages: Array<{ site?: string }>;
}

export const DEMO_LINES = {
  prompt: "Shall I pull up new Södermalm flats?",
  routine: "Want five stories picked out by 8:15?",
  mascot: "I'm Linus, and I'll watch checkout reviews.",
};
export const REFUSED_LINES = ["Shall I check the flats again?", "Want me to pay for those flats?", "I'm Rook, and I'll watch every site."];

export const demoProposals = (digest: string): string => {
  const { sessions } = JSON.parse(digest.replace(/^<browsing_digest>\n/, "").replace(/\n<\/browsing_digest>$/, "")) as { sessions: Session[] };
  const on = (site: string) => sessions.filter(({ pages }) => pages.some((page) => page.site === site)).map(({ id }) => id);
  const flats = on("hemnet.se");
  return JSON.stringify({
    cards: [
      { kind: "prompt", line: DEMO_LINES.prompt, why: "You keep looking at flats for sale on Södermalm", evidence: flats, sites: ["hemnet.se"], prompt: "Look at Hemnet for flats for sale on Södermalm and list the newest five with price and size." },
      { kind: "routine", line: DEMO_LINES.routine, why: "You open Hacker News around half past eight", evidence: on("news.ycombinator.com"), sites: ["news.ycombinator.com"], name: "Morning stories", instructions: "Read the Hacker News front page and list five stories worth my time.", schedule: { kind: "daily", time: "08:15" } },
      { kind: "mascot", line: DEMO_LINES.mascot, why: "You go back and forth between checkout pull requests and Linear", evidence: on("linear.app"), sites: ["github.com", "linear.app"], name: "Linus", instructions: "Keep an eye on my checkout pull requests and the issues next to them.", palette: "kingfisher", accessory: "glasses" },
      // An id that isn't there.
      { kind: "prompt", line: REFUSED_LINES[0], why: "You looked at flats", evidence: ["s999"], prompt: "Check Hemnet again." },
      // A site that isn't in its evidence.
      { kind: "prompt", line: REFUSED_LINES[1], why: "You looked at flats", evidence: flats, prompt: "Pay the deposit at evil-shop.example." },
      // A number its evidence doesn't show.
      { kind: "mascot", line: REFUSED_LINES[2], why: "You opened GitHub 97 times", evidence: on("github.com"), name: "Rook", instructions: "Watch everything." },
    ],
  });
};
