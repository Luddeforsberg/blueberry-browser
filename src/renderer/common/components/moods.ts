export type Mood = "rest" | "sitting" | "curious" | "thinking" | "fetching" | "asking" | "delivered" | "oops" | "off-duty";

// Every mood has words, so nothing depends on seeing the drawing.
export const MOOD_LABELS: Record<Mood, string> = {
  rest: "at rest",
  sitting: "sitting",
  curious: "curious",
  thinking: "thinking",
  fetching: "fetching",
  asking: "waiting for your decision",
  delivered: "finished",
  oops: "something went wrong",
  "off-duty": "asleep",
};
