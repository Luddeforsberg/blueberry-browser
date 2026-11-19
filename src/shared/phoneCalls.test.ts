import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchWithin, oneAtATime, RUNNER_LINK_EVERY_MS, runnerLinkDue } from "./phoneCalls";
import { defined } from "./testing";

describe("a call from the phone page", () => {
  let server: Server;
  let base = "";
  const held: ServerResponse[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/fine") return void response.end('{"ok":true}');
      if (request.url === "/missing") {
        response.statusCode = 404;
        return void response.end("{}");
      }
      held.push(response);
      // Headers and the start of a body, and then nothing more.
      if (request.url === "/stalls") response.write('{"rows":[');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    held.forEach((response) => response.destroy());
    server.close();
  });

  it("gives the status and the body of an answer", async () => {
    expect(await fetchWithin(`${base}/fine`, {}, 1_000)).toEqual({ ok: true, status: 200, text: '{"ok":true}' });
    expect(await fetchWithin(`${base}/missing`, {}, 1_000)).toEqual({ ok: false, status: 404, text: "{}" });
  });

  it("gives up on a server that never answers", async () => {
    const started = Date.now();
    await expect(fetchWithin(`${base}/never`, {}, 200)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("gives up on a body that stops halfway, since the deadline covers reading it", async () => {
    const started = Date.now();
    await expect(fetchWithin(`${base}/stalls`, {}, 200)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("one poll at a time", () => {
  it("runs once more after the one that's out for calls made meanwhile, never two at once", async () => {
    let runs = 0;
    let running = 0;
    let most = 0;
    const finishes: (() => void)[] = [];
    const poll = oneAtATime(() => {
      runs++;
      most = Math.max(most, ++running);
      return new Promise<void>((resolve) => finishes.push(() => (running--, resolve())));
    });

    const first = poll();
    // Asked for while the first is out, as after sending a follow-up: what the first read may be from before it.
    const second = poll();
    const third = poll();
    expect(third).toBe(second);
    expect(runs).toBe(1);
    defined(finishes[0])();
    await first;
    await vi.waitFor(() => expect(runs).toBe(2));
    defined(finishes[1])();
    await second;
    expect(most).toBe(1);

    // With nothing out, a call is a run of its own at once.
    void poll();
    expect(runs).toBe(3);
    defined(finishes[2])();
  });

  it("runs again after one that failed", async () => {
    let runs = 0;
    const poll = oneAtATime(async () => {
      if (++runs === 1) throw new Error("offline");
    });
    await expect(poll()).rejects.toThrow("offline");
    await poll();
    expect(runs).toBe(2);
  });
});

describe("asking again whether a runner is linked", () => {
  it("asks when it never has, and again once a minute has gone", () => {
    expect(runnerLinkDue(null, 0)).toBe(true);
    expect(runnerLinkDue(1_000, 1_000)).toBe(false);
    expect(runnerLinkDue(1_000, 1_000 + RUNNER_LINK_EVERY_MS - 1)).toBe(false);
    expect(runnerLinkDue(1_000, 1_000 + RUNNER_LINK_EVERY_MS)).toBe(true);
  });
});
