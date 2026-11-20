import { ServerError } from "../account/galleryServer";

// A job's start, sent again under the same id until the server answers. A start whose answer was lost may still have
// made the job, and the id makes a repeat give that job back rather than make another, so only an answer is final.

// Given up because the account changed or the app is quitting, with the job maybe made.
export const UNANSWERED = Symbol("unanswered");

// How much longer each wait is than the one before, as multiples of the first, up to the last.
const BACKOFF = [1, 2, 4, 8];
const LONGEST = 15;

// A refusal means no job was made. A lost connection, a server error, a token that ran out or a limit on calls means
// the start may not have been looked at, or was and its answer is gone.
const refused = (error: unknown): boolean =>
  error instanceof ServerError && error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status);

export const startUntilAnswered = async (
  send: () => Promise<string | null>,
  { going, waitMs }: { going: () => boolean; waitMs: number },
): Promise<string | typeof UNANSWERED> => {
  for (let tries = 0; ; tries++) {
    try {
      const id = await send();
      if (id) return id;
    } catch (error) {
      if (refused(error)) throw error;
    }
    if (!going()) return UNANSWERED;
    await new Promise((resolve) => setTimeout(resolve, waitMs * (BACKOFF[tries] ?? LONGEST)));
    if (!going()) return UNANSWERED;
  }
};
