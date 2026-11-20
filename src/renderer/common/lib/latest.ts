import { useEffect, useState } from "react";
import { Latest } from "@shared/lateWork";

// Latest wins in a component: the same `Latest` for as long as it's there, ended when it goes, so an answer that comes
// after it has gone, or after a newer request or an edit, is never applied. Call `next()` before asking, `end()` when what
// was asked about changes, and check the turn's `current` once the answer is here.
export const useLatest = (): Latest => {
  const [latest] = useState(() => new Latest());
  useEffect(() => () => latest.end(), [latest]);
  return latest;
};
