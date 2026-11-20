// Sending from a prompt box, in the app or on the phone. The box stays open while a message is on its way, so whatever
// is written after it was sent must still be there once it's taken.

// What stays in the box once `sent` has been taken: what was typed on after it, or all of it if it was changed.
export const leftAfterSend = (now: string, sent: string): string => {
  if (now === sent) return "";
  return now.startsWith(sent) ? now.slice(sent.length).trimStart() : now;
};
