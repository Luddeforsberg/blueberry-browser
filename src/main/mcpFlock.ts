import type { MascotProfile } from "../shared/library";
import { BERRY, normaliseSite, permissionsInWords } from "../shared/mascots";

// What an app over MCP is told about a bird, and how the sites it asks for are read, the same for apps on this computer
// (`mcpTools.ts`) and for ChatGPT and Claude through the relay (`runner/src/relayTools.ts`). Plain data, no Electron.

export const agentSummary = (bird: MascotProfile) => ({
  id: bird.id,
  name: bird.name,
  for: bird.id === BERRY.id ? "Anything. Berry is the user's general assistant in the browser." : bird.instructions,
  sites: bird.sites.length > 0 ? bird.sites : "any",
  permissions: permissionsInWords(bird).map(({ text }) => text),
});

// Each site made plain, or the first one given that isn't a site.
export const sitesFromApp = (sites: unknown): { sites: string[] } | { bad: string } => {
  const given = Array.isArray(sites) ? sites.map(String) : [];
  const clean = given.map((site) => normaliseSite(site));
  const bad = given.find((_, index) => clean[index] === null);
  return bad === undefined ? { sites: clean as string[] } : { bad };
};
