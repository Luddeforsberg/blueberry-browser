// How the phone page asks the server, bundled into site/shared.js. Plain code with no DOM, so it can be tested here.

// A call that hangs would hold up everything waiting on it, the polling and a shared token refresh among them.
export const CALL_DEADLINE_MS = 15_000;
// The page only learns that a runner was linked or unlinked from the Mac by asking again, so it does every so often.
export const RUNNER_LINK_EVERY_MS = 60_000;

export interface CallAnswer {
  ok: boolean;
  status: number;
  text: string;
}

// One call with a deadline that covers reading the body too, since a server can send its headers and then stall.
// Past the deadline it's aborted, and the promise rejects as a failed fetch does.
export const fetchWithin = async (url: string, init: RequestInit, ms = CALL_DEADLINE_MS, fetcher: typeof fetch = fetch): Promise<CallAnswer> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
};

// Asking while one is out gets that one rather than starting another, so nothing that wakes the page, such as it coming
// back to the front, can set a second round of polling going.
export const oneAtATime = <T>(work: () => Promise<T>): (() => Promise<T>) => {
  let out: Promise<T> | null = null;
  return () =>
    (out ??= work().finally(() => {
      out = null;
    }));
};

// Whether to ask again if a runner is linked: never asked, or not for a while.
export const runnerLinkDue = (checkedAt: number | null, now: number): boolean => checkedAt === null || now - checkedAt >= RUNNER_LINK_EVERY_MS;
