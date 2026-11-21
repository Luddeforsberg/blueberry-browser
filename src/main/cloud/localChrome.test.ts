import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { localChrome } from "./localChrome";

// A Chrome that starts only when told to, and says it's gone once killed.
const chrome = vi.hoisted(() => {
  const made: { kill: Mock; listening: () => void }[] = [];
  return {
    made,
    spawn: () => {
      const child = Object.assign(new EventEmitter(), {
        exitCode: null as number | null,
        signalCode: null as string | null,
        stderr: Object.assign(new EventEmitter(), { resume: () => {} }),
        kill: vi.fn(() => {
          child.signalCode = "SIGTERM";
          child.emit("exit");
        }),
      });
      made.push({
        kill: child.kill,
        listening: () => child.stderr.emit("data", Buffer.from("DevTools listening on ws://127.0.0.1:9/x\n")),
      });
      return child;
    },
  };
});
// Connecting never finishes, so only the stop can end it.
const connecting = vi.hoisted(() => ({ connect: vi.fn(() => new Promise(() => {})) }));

vi.mock("node:child_process", () => ({ spawn: chrome.spawn }));
vi.mock("./cloudProvider", async (original) => ({ ...(await original<object>()), connectOverCdp: connecting.connect }));

const started = async (stop: AbortSignal) => {
  const made = await localChrome({ executable: "chrome" }).create({ contextId: null, sessionId: null }, {} as never);
  return made.connect(stop);
};

afterEach(() => {
  chrome.made.length = 0;
  connecting.connect.mockClear();
});

describe("localChrome", () => {
  it("kills a browser stopped before it says where it's listening", async () => {
    const stop = new AbortController();
    const starting = started(stop.signal);
    await expect.poll(() => chrome.made.length).toBe(1);
    stop.abort();
    await expect(starting).rejects.toThrow(/stopped while it started/);
    expect(chrome.made[0]?.kill).toHaveBeenCalledOnce();
    expect(connecting.connect).not.toHaveBeenCalled();
  });

  it("kills the browser it launched while the connection closes, so a close that stalls can't keep it running", async () => {
    connecting.connect.mockResolvedValueOnce({ close: () => new Promise(() => {}), contexts: () => [{}] });
    const starting = started(new AbortController().signal);
    await expect.poll(() => chrome.made.length).toBe(1);
    chrome.made[0]?.listening();
    void (await starting).close();
    await expect.poll(() => chrome.made[0]?.kill.mock.calls.length).toBe(1);
  });

  it("kills a browser stopped while it's being connected to", async () => {
    const stop = new AbortController();
    void started(stop.signal).catch(() => {});
    await expect.poll(() => chrome.made.length).toBe(1);
    chrome.made[0]?.listening();
    await expect.poll(() => connecting.connect.mock.calls.length).toBe(1);
    stop.abort();
    await expect.poll(() => chrome.made[0]?.kill.mock.calls.length).toBe(1);
  });
});
