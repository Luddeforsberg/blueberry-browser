import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { EMPTY_HTML_DATA, HTML_CARD_NO_SCRIPT_FILES, HTML_FRAME_SANDBOX, htmlCardDocument, htmlCardDownload, htmlCardPolicy, scriptJson, wantsCharts, type HtmlCardData } from "./nestHtml";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("base64");
const build = (html: string, data: HtmlCardData = EMPTY_HTML_DATA, charts: string | null = null) => htmlCardDocument(html, data, charts, sha256);
const HEAD = "<!doctype html><html><head>";
// Our one script, as the page has it, and the policy before it.
const bootOf = (document: string) => /<script>([\s\S]*?)<\/script>/.exec(document)![1];
const policyOf = (document: string) => /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(document)![1];
const directives = (policy: string) => new Map(policy.split("; ").map((directive) => [directive.split(" ")[0], directive.split(" ").slice(1)]));

describe("scriptJson", () => {
  it("can't close the script it sits in, start a comment, or break a line, and reads back the same", () => {
    const hostile = { answer: "</script><script>alert(1)</script> <!-- & </SCRIPT > \u2028\u2029 \"quoted\" <\\/script>" };
    const json = scriptJson(hostile);
    expect(json).not.toMatch(/<|>|&|\u2028|\u2029/);
    expect(JSON.parse(json)).toEqual(hostile);
    // As JavaScript too, which is how the page reads it.
    expect(new Function(`return ${json}`)()).toEqual(hostile);
  });

  it("writes nothing it wasn't given as JSON", () => {
    expect(scriptJson(undefined)).toBe("null");
    expect(scriptJson("")).toBe('""');
    expect(scriptJson([])).toBe("[]");
  });
});

describe("the policy", () => {
  it("lets nothing load or leave, and no script run but ours: no host, no scheme but data: and blob:", () => {
    const policy = directives(htmlCardPolicy("abc="));
    expect(policy.get("default-src")).toEqual(["'none'"]);
    for (const name of ["connect-src", "frame-src", "worker-src", "object-src", "form-action", "base-uri"]) expect(policy.get(name)).toEqual(["'none'"]);
    // Neither of these, which would let a frame inside the page start scripts, or a script load one from anywhere.
    expect(policy.get("script-src")).toEqual(["'sha256-abc='", "'unsafe-eval'"]);
    expect(policy.get("style-src")).toEqual(["'unsafe-inline'"]);
    for (const [name, sources] of policy) for (const source of sources) if (name !== "script-src") expect(["'none'", "'unsafe-inline'", "data:", "blob:"]).toContain(source);
  });

  it("comes first, before anything of the page's own, whatever the page starts with", () => {
    const pages = [
      "",
      "<p>hi</p>",
      '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src *"><base href="https://evil.example/"></head><body></body></html>',
      '<meta http-equiv="refresh" content="0;url=http://127.0.0.1/">',
      "</head></html><script>1</script>",
    ];
    const prefix = build("");
    for (const page of pages) {
      const document = build(page);
      expect(document.startsWith(`${HEAD}<meta http-equiv="Content-Security-Policy" content="`)).toBe(true);
      // Everything before the page is ours, and the page is only ever after it.
      expect(document).toBe(prefix + page);
    }
  });

  it("names our script by the hash of exactly what the page has, so it alone runs", () => {
    for (const charts of [null, "LIB", "a\r\nb\rc"]) {
      const document = build("<script>new nest.charts(c, {})</script>", EMPTY_HTML_DATA, charts);
      expect(directives(policyOf(document)).get("script-src")![0]).toBe(`'sha256-${sha256(bootOf(document))}'`);
      // The parser reads every line break as \n, and that's what's hashed.
      expect(bootOf(document)).not.toContain("\r");
    }
  });

  it("has a second policy, right after it, that lets no script load from anywhere, even one that names our hash", () => {
    const second = `<meta http-equiv="Content-Security-Policy" content="${HTML_CARD_NO_SCRIPT_FILES}">`;
    const document = build("<p></p>");
    expect(document.startsWith(`${HEAD}<meta http-equiv="Content-Security-Policy" content="${policyOf(document)}">${second}`)).toBe(true);
    // No hash, no host and no scheme, so an integrity attribute matches nothing, and inline scripts still need the hash.
    expect(directives(HTML_CARD_NO_SCRIPT_FILES)).toEqual(new Map([["script-src", ["'unsafe-inline'", "'unsafe-eval'"]]]));
    const file = htmlCardDownload("<p></p>", null, sha256, "page");
    expect(file).toContain(`content="${policyOf(file)}">${second}`);
  });

  it("turns DNS prefetching off and sends no referrer, before our script", () => {
    const document = build("<p></p>");
    const head = document.slice(0, document.indexOf("<script>"));
    expect(head).toContain('<meta http-equiv="x-dns-prefetch-control" content="off">');
    expect(head).toContain('<meta name="referrer" content="no-referrer">');
  });
});

describe("htmlCardDocument", () => {
  const data: HtmlCardData = {
    card: { bird: "Scout", answer: "</script><img src=x onerror=alert(1)>", table: { header: ["Company", "Revenue"], rows: [["Brygga", "12"]] } },
    inputs: [{ name: "Writer", answer: null, table: null }],
    images: [],
  };

  it("takes WebRTC away before anything else, then gives the page its data in a script the data can't leave", () => {
    const document = build("<p></p>", data);
    const boot = bootOf(document);
    expect(boot.startsWith("for (const name of Object.getOwnPropertyNames(window)) if (/^(webkit)?rtc/i.test(name)) delete window[name];")).toBe(true);
    const given = /window\.nest = \{ data: (.*?), charts: null \};/.exec(boot);
    expect(JSON.parse(given![1])).toEqual(data);
    // Classic scripts only: a module's import or export can't run with eval.
    expect(boot).not.toContain('"module"');
    // Only our own script and none the data opened.
    expect(document.match(/<script>/g)).toHaveLength(1);
    expect(document).not.toContain("<img src=x");
  });

  it("puts the chart library in only when the page asks for it, and never one that could close its script", () => {
    const asks = "<script>new nest.charts(c, {})</script>";
    expect(build("<canvas></canvas>", data, "LIB")).not.toContain("LIB");
    expect(bootOf(build(asks, data, "LIB"))).toContain("LIB\n;window.nest.charts = window.Chart ?? null;");
    expect(build(asks, data, null)).not.toContain("window.nest.charts =");
    for (const bad of ["x</script><script>bad", "x</SCRIPT >bad", "<!-- bad", "bad\0"]) expect(build(asks, data, bad)).not.toContain("bad");
  });

  it("knows a page wants charts by nest.charts or by Chart.js's own name", () => {
    expect(wantsCharts("new nest.charts(el, cfg)")).toBe(true);
    expect(wantsCharts("const c = new Chart(el, cfg)")).toBe(true);
    expect(wantsCharts("Chart.register(x)")).toBe(true);
    expect(wantsCharts("<h1>Chart of sales</h1>")).toBe(false);
    expect(wantsCharts("")).toBe(false);
  });
});

describe("the frame", () => {
  it("runs scripts and nothing else: no origin, no popups, navigation, forms, dialogs or downloads", () => {
    expect(HTML_FRAME_SANDBOX.split(/\s+/)).toEqual(["allow-scripts"]);
  });
});

describe("htmlCardDownload", () => {
  it("puts the page in the same sandboxed frame, in a page with no script that lets the frame go nowhere", () => {
    const html = '<p title="a & b">"</iframe><script>top.location = "https://evil.example/"</script></p>';
    const page = build(html);
    const file = htmlCardDownload(html, null, sha256, 'chart "1" <b>');
    // The same policy as the page's, which the frame takes on too, so our script still runs there and nothing else.
    expect(policyOf(file)).toBe(policyOf(page));
    expect(directives(policyOf(file)).get("frame-src")).toEqual(["'none'"]);
    expect(file).not.toContain("<script");
    // One frame, sandboxed as on the board, whose page can't end the attribute it's in.
    expect(file.match(/<iframe /g)).toHaveLength(1);
    expect(file).toContain(`<iframe sandbox="${HTML_FRAME_SANDBOX}" `);
    const srcdoc = /srcdoc="([^"]*)"><\/iframe><\/body><\/html>$/.exec(file);
    expect(srcdoc).not.toBeNull();
    const read = srcdoc![1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    expect(read).toBe(page);
    expect(file).toContain("<title>chart &quot;1&quot; &lt;b&gt;</title>");
  });
});
