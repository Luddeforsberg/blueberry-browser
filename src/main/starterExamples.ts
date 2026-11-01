import type { MascotExample } from "../shared/library";

// Real runs only, word for word, from evals/results/2026-11-01-examples.runs.json. A starter that isn't here shows no example.
export const STARTER_EXAMPLES: Record<string, MascotExample> = {
  "fact-checker": {
    prompt: "Is it true that the Great Wall of China can be seen from space with the naked eye?",
    answer: "**Yes, but only with an important qualification.** Wikipedia supports the claim for low Earth orbit under nearly perfect conditions. It quotes NASA’s assessment:\n\n> “NASA states that it is barely visible, and only under nearly perfect conditions; it is no more conspicuous than many other human-made objects.”\n\nThe article notes that astronaut reports differ. It also says the Wall **cannot** be seen with the naked eye from the Moon.\n\nSource: [Wikipedia: Great Wall of China — Visibility from space](https://en.wikipedia.org/wiki/Great_Wall_of_China#Visibility_from_space)",
  },
  "commute-check": {
    prompt: "Is the green line on the tunnelbana running normally right now?",
    answer: "Yes. [SL reports no disruptions](https://sl.se/reseplanering/trafiklaget?name=Gr%C3%B6na%20linjen&lineGroupCode=TUB1&transportMode=METRO&text=Gr%C3%B6na%20linjen) on the Green Line. Its status was updated at 00:51 today.",
  },
  "morning-paper": {
    prompt: "What's in the news today? Keep it to three stories.",
    answer: "**Morning briefing**\n\n- **Sweden:** Centre Party leader Elisabeth Thand Ringqvist will face a parliamentary vote for prime minister on Tuesday. If she fails, the speaker says Ulf Kristersson will be asked to explore forming a government. [Ekot](https://www.sverigesradio.se/artikel/c-ledaren-ska-provas-i-statsministeromrostning)\n- **Ukraine:** Russian drone attacks have hit energy and railway infrastructure, leaving more than 280,000 households without electricity, according to President Volodymyr Zelenskyy. Repairs are under way. [SVT](https://www.svt.se/nyheter/utrikes/direktrapport-forsamrat-sakerhetslage?inlagg=64849633b0ffcb7a13b234ec76760ecd)\n- **France:** Around 320,000 people demonstrated on Saturday, according to the interior ministry, with clashes and more than 420 arrests. Protesters were expressing anger over high living costs and neglected schools. [SVT](https://www.svt.se/nyheter/utrikes/sammandrabbningar-vid-nya-protester-i-frankrike)",
  },
  "repo-keeper": {
    prompt: "Go through the three newest open pull requests on github.com/electron/electron. I'm not a maintainer there.",
    answer: "**Repo Keeper:** None of these PRs visibly requests anything from you.\n\n- [#55526](https://github.com/electron/electron/pull/55526) — Backports read-only managed extension storage to 45.x; 74/75 checks pass; maintainers need to grant backport approval.\n- [#55525](https://github.com/electron/electron/pull/55525) — Backports the same feature to 46.x; 74/75 checks pass; maintainers need to grant backport approval.\n- [#55512](https://github.com/electron/electron/pull/55512) — Updates Chromium to 156.0.8078.80 on 45.x; 74/76 checks pass, with at least one pending; maintainers should review the remaining checks and the updated patch.",
  },
};
