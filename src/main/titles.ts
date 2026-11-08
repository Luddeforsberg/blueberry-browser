// The checks every title from the cheap model goes through, a chat's and a Nest card's alike: no quotes around it or
// punctuation at its end, NONE for no topic yet, and cut on its last whole character past the limit.
const MAX_TITLE_LENGTH = 60;

export const tidyTitle = (reply: string): string | null => {
  const title = reply.trim().replace(/^["'“”]+|["'“”.!?]+$/g, "").trim();
  if (!title || title.toUpperCase() === "NONE") return null;
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : title;
};
