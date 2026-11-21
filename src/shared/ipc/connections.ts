// Part of the IPC contract (ipc.ts): what Settings shows of the phone, MCP apps, the account and the cloud.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

// Replies from the phone, for Settings and Needs you. Nothing here can be used to read the bot's token, which never
// comes back from main once it's saved.
export interface PhoneState {
  status: "off" | "pairing" | "connected";
  botName: string | null;
  // The one-time link that binds the user's chat, while it's waiting for one.
  pairLink: string | null;
  // What's wrong right now, in words.
  problem: string | null;
}

// Claude and other apps on this computer using Blueberry over MCP. The token never comes back from main: snippets
// here show it hidden, and copying one puts the real one straight on the clipboard.
export interface McpSnippet {
  app: string;
  where: string;
  text: string;
}

export interface McpActivity {
  id: string;
  client: string;
  tool: string;
  at: number;
  summary: string;
  failed: boolean;
}

export interface McpState {
  on: boolean;
  // Null while it's off, or couldn't start.
  url: string | null;
  problem: string | null;
  snippets: McpSnippet[];
  // Newest first. Memory only, so it starts empty on each launch.
  activity: McpActivity[];
}

export interface PhoneAnswered {
  approvalId: string;
  said: string;
}

// Who's signed in, for publishing. Tokens never come back from main, and the password only ever goes the other way.
export interface AccountState {
  // "not-set-up" means this copy has no Gallery server, so nothing about accounts shows.
  status: "not-set-up" | "signed-out" | "signed-in";
  email: string | null;
  problem: string | null;
  // The field the problem is about, so it's said under that one.
  problemAbout: "email" | "password" | null;
}

// Settings > Cloud > Runner: the account the cloud runner signs in as, linked to this user's, and whether the runner has
// accepted. Only its email, never its password, which only the runner has.
export interface RunnerState {
  status: "not-set-up" | "signed-out" | "none" | "waiting" | "linked";
  email: string | null;
  problem: string | null;
  // Where ChatGPT or Claude can connect to the mascots in the cloud, once linked and if the runner serves it.
  relayUrl: string | null;
}

// Settings > Cloud. The key and project id never come back here once saved: only whether there are any.
export interface CloudState {
  // "local" is the test browser on this computer, only in an unpackaged app.
  provider: "browserbase" | "local" | null;
  configured: boolean;
  status: "off" | "idle" | "starting" | "running" | "ended";
  // The chat or run using it now, if any.
  busy: boolean;
  // Whether End has anything to end, here or at the provider.
  canEnd: boolean;
  // The provider didn't confirm the last end, so a paid session may still be running.
  unreleased: boolean;
  // Something it saved couldn't be read, so nothing can start or be saved until the key is forgotten.
  unreadable: boolean;
  problem: string | null;
  // Sites brought into the cloud browser signed in, newest first. Names and dates only, never a cookie.
  logins: CloudLogin[];
}

// "brought": its cookies went in. "checked": the user saw it signed in there. "signed-out": they saw it wasn't.
export type CloudLoginStatus = "brought" | "checked" | "signed-out";

export interface CloudLogin {
  site: string;
  addedAt: number;
  checkedAt: number | null;
  status: CloudLoginStatus;
}

// What a cloud tab shows: the provider's live view in a frame, or pictures sent as `cloud:frame`.
// `checking` names the site when the user opened it to see whether they're signed in there.
export type CloudView =
  | { kind: "live"; url: string; takenOver: boolean; checking: string | null }
  | { kind: "frames"; takenOver: boolean; checking: string | null }
  | { kind: "gone" };

export interface CloudFrame {
  tabId: string;
  // A JPEG, base64.
  data: string;
}
