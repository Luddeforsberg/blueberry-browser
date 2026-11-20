// Settings' five sections and its pages one step in (DESIGN.md section 10, Settings). A Settings tab's param names
// where it is, so main's Back can step out of a page, and a saved session or an older caller still lands somewhere.

export const SETTINGS_SECTIONS = ["general", "mascots", "privacy", "connections", "account"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

// Each page one step in, and the section it opens from.
export const SETTINGS_PAGES = {
  "what-leaves": "privacy",
  "site-permissions": "privacy",
  "bring-in-history": "privacy",
  "ai-service": "connections",
  phone: "connections",
  claude: "connections",
  cloud: "connections",
} as const satisfies Record<string, SettingsSection>;
export type SettingsPage = keyof typeof SETTINGS_PAGES;

export type SettingsPlace = SettingsSection | SettingsPage;

// What the sections were called before there were five, by other pages and in saved sessions.
const OLD_NAMES: Record<string, SettingsPlace> = {
  Appearance: "general",
  Downloads: "general",
  Berry: "mascots",
  "Data and privacy": "privacy",
  "Site permissions": "site-permissions",
  Phone: "phone",
  Claude: "claude",
  Cloud: "cloud",
  Account: "account",
};

const isSection = (value: string): value is SettingsSection => (SETTINGS_SECTIONS as readonly string[]).includes(value);
const isPage = (value: string): value is SettingsPage => Object.hasOwn(SETTINGS_PAGES, value);

// Where a param lands, or null for none or one nobody knows, which leaves Settings where it is.
export const settingsPlace = (param: string | null): { section: SettingsSection; page: SettingsPage | null } | null => {
  if (param === null) return null;
  const place = Object.hasOwn(OLD_NAMES, param) ? OLD_NAMES[param] : param;
  if (isSection(place)) return { section: place, page: null };
  if (isPage(place)) return { section: SETTINGS_PAGES[place], page: place };
  return null;
};

// Back from a page one step in is its section. From a section there's nowhere to go back to.
export const settingsBack = (param: string | null): SettingsSection | null => {
  const place = settingsPlace(param);
  return place?.page ? place.section : null;
};
