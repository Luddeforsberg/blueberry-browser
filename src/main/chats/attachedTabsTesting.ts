import type { MascotProfile } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import { Chats, type ChatCloud, type ChatRunner } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { ReplyMessage, StreamReply } from "./agent";
import type { PageTool } from "../tools/browserTools";
import type { Tab } from "../tabs/Tab";
import { defined } from "../../shared/testing";

// What the tests of attachments share: tabs to attach, and a `Chats` whose replies stay open until they're let go. Each
// test file mocks "./agent" itself, before this loads it, and calls `resetReplies` before each test.

export const fakeTab = (id: string, url: string, text = `The text of ${url}`) =>
  ({
    id,
    url,
    title: `Title of ${id}`,
    favicon: null,
    foreignFrames: [],
    mayShowCode: false,
    trouble: null,
    loadError: null,
    actor: null,
    heldForUser: false,
    screenshot: async () => ({ toDataURL: () => `data:image/png;base64,${id}` }),
    getTabText: async () => text,
    getTextWithFrames: async () => text,
    settled: async () => {},
  }) as unknown as Tab;

export const SCOUT: MascotProfile = { ...BERRY, id: "scout", name: "Scout", sites: ["shop.example"], deletedAt: null };

interface Setup {
  tabs?: Tab[];
  active?: Tab | null;
  stream?: StreamReply;
  runner?: ChatRunner;
  cloud?: ChatCloud;
}

export let sent: ReplyMessage[][];
let tools: PageTool[];
// Holds every reply open until it's let go, so its tools can be looked at while it runs.
export let release: () => void;
let begun: Promise<void>;
let begin: () => void;
const nextReply = () => {
  tools = [];
  begun = new Promise<void>((resolve) => (begin = resolve));
};
// The reply starts after the page and tabs are read, so its tools are only there once it has.
export const started = () => begun;

export const holding: StreamReply = async function* (messages, _signal, options) {
  sent.push(messages);
  tools = options.tools;
  const held = new Promise<void>((resolve) => (release = resolve));
  begin();
  await held;
  yield "ok";
};

export const setup = ({ tabs = [], active = null, stream = holding, runner, cloud }: Setup = {}) => {
  const store = new ChatStore(":memory:");
  let ended = () => {};
  const chats = new Chats(
    store,
    stream,
    async () => null,
    {
      activeTab: () => active,
      allTabs: () => tabs,
      openBackgroundTab: () => fakeTab("tab-opened", "https://opened.example/"),
      closeTab: () => true,
      actionApproval: () => "risky",
    },
    {
      onChunk: () => {},
      onThread: (thread) => {
        if (thread.partial === null) ended();
      },
      onListChanged: () => {},
      onWorkingTabs: () => {},
    },
    (id) => (id === SCOUT.id ? SCOUT : BERRY),
    null,
    cloud ?? null,
    runner ?? null,
  );
  const replyEnded = () => {
    nextReply();
    return new Promise<void>((resolve) => (ended = resolve));
  };
  return { chats, store, replyEnded };
};

export const tool = (name: string) => tools.find((candidate) => candidate.name === name)!;
export const contentOf = (messages: ReplyMessage[]) => JSON.stringify(messages.map(({ content }) => content));
export const listed = async () =>
  JSON.parse(defined((await tool("list_tabs").run({})).split("\n\n")[0])).map(({ id }: { id: string }) => id);

export const resetReplies = () => {
  sent = [];
  release = () => {};
  nextReply();
};
