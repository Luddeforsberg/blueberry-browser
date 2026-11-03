import { describe, expect, it } from "vitest";
import { recordWithoutQueries, withoutQueries } from "./addresses";

const SORRY = "https://www.google.com/sorry/index?continue=https://www.google.com/search%3Fq%3Ddate&q=EgS8lTMhGPbQ";

describe("addresses in a saved run", () => {
  it("lose their query and fragment, and nothing else changes", () => {
    expect(withoutQueries(`Tab is now at ${SORRY}, titled x.`)).toBe("Tab is now at https://www.google.com/sorry/index, titled x.");
    expect(withoutQueries("open_tab {\"url\":\"https://www.bing.com/search?q=a+b#top\"}")).toBe("open_tab {\"url\":\"https://www.bing.com/search\"}");
    expect(withoutQueries("https://linear.app/changelog and plain words")).toBe("https://linear.app/changelog and plain words");
    expect(withoutQueries("")).toBe("");
  });

  it("keep the answer word for word, except a captcha's address", () => {
    const answer = `See [SL](https://sl.se/x?name=Gr%C3%B6na) and ${SORRY}`;
    const saved = recordWithoutQueries({ answer, endUrl: SORRY, tools: [`open_tab {"url":"${SORRY}"}`], steps: ["Opened google.com"] });
    expect(saved).toEqual({
      answer: "See [SL](https://sl.se/x?name=Gr%C3%B6na) and https://www.google.com/sorry/index",
      endUrl: "https://www.google.com/sorry/index",
      tools: ['open_tab {"url":"https://www.google.com/sorry/index"}'],
      steps: ["Opened google.com"],
    });
    expect(JSON.stringify(saved)).not.toContain("EgS8");
  });
});
