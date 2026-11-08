// An HTML card: a page a card's bird made, shown live on the board. A model that read web pages wrote it, so it's a
// stranger's page and runs with nothing: no network, no parent, no preload. This file is the page it runs as and the
// frame it runs in. Main builds the page, and the chrome only draws the frame. Pure, so main and the chrome share it.

// The frame's only permission: its own scripts. Never allow-same-origin, which would give it the chrome's origin and with
// it the chrome's DOM and API, and nothing that opens, navigates, submits, downloads or shows a dialog.
export const HTML_FRAME_SANDBOX = "allow-scripts";

// Features the frame is refused outright, on top of what a frame from no origin is refused anyway.
export const HTML_FRAME_ALLOW = ["camera", "microphone", "geolocation", "display-capture", "clipboard-read", "clipboard-write", "fullscreen", "payment", "usb", "serial", "hid", "bluetooth"]
  .map((feature) => `${feature} 'none'`)
  .join("; ");

// No network at all: pictures, fonts and media only from data the page holds, and no script but the page's first one,
// ours, by its hash. That script removes WebRTC, which no policy in this Chromium covers, and then runs the page's own
// scripts with eval. A frame inside the page inherits this policy but not our script, so it can't run anything at all,
// and so can't get a WebRTC of its own. No 'unsafe-inline' and no 'strict-dynamic', since either would let a frame
// inside start scripts, or a script load one from anywhere. A policy the page adds itself can only take more away,
// since every policy a page has applies at once.
export const htmlCardPolicy = (bootHash: string): string =>
  [
    "default-src 'none'",
    `script-src 'sha256-${bootHash}' 'unsafe-eval'`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");

// A second policy beside it. A hash also lets in a script from any address whose integrity attribute names that hash,
// and the request goes out before the check, so a page could copy ours from its policy and send data in the address.
// Every policy applies at once, and this one names no hash and no address: no script loads from anywhere, and inline
// ones still need the first policy's hash.
export const HTML_CARD_NO_SCRIPT_FILES = "script-src 'unsafe-inline' 'unsafe-eval'";

const policyMetas = (policy: string): string =>
  `<meta http-equiv="Content-Security-Policy" content="${policy}">` + `<meta http-equiv="Content-Security-Policy" content="${HTML_CARD_NO_SCRIPT_FILES}">`;

export interface HtmlCardTable {
  header: string[];
  rows: string[][];
}

// What the page reads as `window.nest.data`: what its maker card had, read when the card is drawn. Its own answer and the
// table in it, each card its lines read from, and the pictures it was given, as data addresses. All of it may come from
// web pages, as the page itself may.
export interface HtmlCardData {
  card: { bird: string; answer: string | null; table: HtmlCardTable | null };
  inputs: { name: string; answer: string | null; table: HtmlCardTable | null }[];
  images: { name: string; src: string }[];
}

export const EMPTY_HTML_DATA: HtmlCardData = { card: { bird: "", answer: null, table: null }, inputs: [], images: [] };

// JSON that can sit inside a <script> as it is: nothing in it can close the element, start a comment, or end a line in
// older JavaScript, whatever the strings in it say.
export const scriptJson = (value: unknown): string =>
  (JSON.stringify(value) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

// Whether the page asks for the chart library: by `nest.charts`, as the tool says, or by using Chart.js's own name.
export const wantsCharts = (html: string): boolean => /\bnest\.charts\b|\bnew\s+Chart\s*\(|\bChart\.(?:register|defaults)\b/.test(html);

// First, before the page has run anything: every WebRTC constructor goes, since a peer connection reaches STUN and TURN
// servers outside the network stack, where nothing else here sees it. The page can't get one back: a frame inside it has
// its own origin, and can't run a script.
const NO_WEBRTC = "for (const name of Object.getOwnPropertyNames(window)) if (/^(webkit)?rtc/i.test(name)) delete window[name];";

// Last: the page's own scripts, which the policy kept from running, once the page has been read and before
// DOMContentLoaded, in the order they're written, each on its own as a script would be. Only inline ones, since there's
// nowhere to load one from, and only classic JavaScript, since a module's import or export can't run this way. Errors
// show as the page's own.
const RUN_PAGE = `{
const ours = document.currentScript;
document.addEventListener("readystatechange", () => {
  for (const script of document.querySelectorAll("script")) {
    if (script === ours) continue;
    const type = (script.getAttribute("type") ?? "").trim().toLowerCase();
    if (script.hasAttribute("src") || !["", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"].includes(type)) continue;
    try { (0, eval)(script.textContent ?? ""); } catch (error) { reportError(error); }
  }
}, { once: true });
}`;

// The one script the policy lets run, so its hash is the page's. Charts it draws count from zero unless told otherwise,
// since an axis cut short makes a small change look large. The HTML parser reads every line break as \n, which is
// what it's hashed as, and a NUL in it would read as something else, so a library with one isn't put in.
const bootScript = (data: HtmlCardData, charts: string | null): string => {
  const library = charts && !/<\/script|<!--|\0/i.test(charts) ? `${charts.replace(/\r\n?/g, "\n")}\n;window.nest.charts = window.Chart ?? null;\ntry { window.Chart.defaults.scales.linear.beginAtZero = true; } catch {}\n` : "";
  return `${NO_WEBRTC}\nwindow.nest = { data: ${scriptJson(data)}, charts: null };\n${library}${RUN_PAGE}`;
};

// The whole page as the frame gets it, and its policy. Before anything of the page's own: the policy, DNS prefetching
// turned off, which the policy doesn't cover and can't be turned back on, no referrer, then our script with the data, and
// the chart library when the page asks for it. The page follows, so a doctype, <html> or <head> of its own only merge
// into these, and nothing in it comes before the policy. `sha256` is base64, given by main.
const buildPage = (html: string, data: HtmlCardData, charts: string | null, sha256: (text: string) => string): { page: string; policy: string } => {
  const boot = bootScript(data, wantsCharts(html) ? charts : null);
  const policy = htmlCardPolicy(sha256(boot));
  const page =
    "<!doctype html><html><head>" +
    policyMetas(policy) +
    '<meta charset="utf-8">' +
    '<meta http-equiv="x-dns-prefetch-control" content="off">' +
    '<meta name="referrer" content="no-referrer">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light dark">' +
    `<script>${boot}</script>` +
    "\n" +
    html;
  return { page, policy };
};

export const htmlCardDocument = (html: string, data: HtmlCardData, charts: string | null, sha256: (text: string) => string): string => buildPage(html, data, charts, sha256).page;

// What Download writes: the same page in the same sandboxed frame, inside a page that has no script and lets its frame
// go nowhere, since a browser it's opened in later has none of main's locks. Without it, a page opened on its own could
// take the board's data along to any address by going there. The outer page has the same policy, since the frame takes
// it on as well as its own, and it's what lets our script run in there. It never has the board's data: `window.nest.data`
// is there but empty, since a browser that looks up the host of a <link rel="dns-prefetch"> or "preconnect" ahead of
// time, which no policy covers, would let a page spell the data out in a name. Blueberry itself turns that off
// (`index.ts`). What the bird wrote into the page itself still goes with it.
export const htmlCardDownload = (html: string, charts: string | null, sha256: (text: string) => string, title: string): string => {
  const { page, policy } = buildPage(html, EMPTY_HTML_DATA, charts, sha256);
  const attribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    "<!doctype html><html><head>" +
    policyMetas(policy) +
    '<meta charset="utf-8">' +
    '<meta name="referrer" content="no-referrer">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light dark">' +
    `<title>${attribute(title)}</title>` +
    "<style>html, body { margin: 0; height: 100%; } iframe { display: block; border: 0; width: 100%; height: 100%; }</style>" +
    `</head><body><iframe sandbox="${HTML_FRAME_SANDBOX}" allow="${HTML_FRAME_ALLOW}" referrerpolicy="no-referrer" title="${attribute(title)}" srcdoc="${attribute(page)}"></iframe></body></html>`
  );
};
