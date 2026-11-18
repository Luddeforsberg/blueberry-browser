import type { MascotProfile } from "../shared/library";
import { BERRY, normaliseSite, permissionsInWords } from "../shared/mascots";

// What an app over MCP is told about a mascot, and how the sites it asks for are read, the same for apps on this computer
// (`mcpTools.ts`) and for ChatGPT and Claude through the relay (`runner/src/relayTools.ts`). Plain data, no Electron.

export const agentSummary = (mascot: MascotProfile) => ({
  id: mascot.id,
  name: mascot.name,
  for: mascot.id === BERRY.id ? "Anything. Berry is the user's general assistant in the browser." : mascot.instructions,
  sites: mascot.sites.length > 0 ? mascot.sites : "any",
  permissions: permissionsInWords(mascot).map(({ text }) => text),
});

// Each site made plain, or the first one given that isn't a site.
export const sitesFromApp = (sites: unknown): { sites: string[] } | { bad: string } => {
  const given = Array.isArray(sites) ? sites.map(String) : [];
  const clean = given.map((site) => normaliseSite(site));
  const bad = given.find((_, index) => clean[index] === null);
  return bad === undefined ? { sites: clean as string[] } : { bad };
};
