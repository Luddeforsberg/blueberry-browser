import type { SettingsPlace } from "@shared/settingsPlaces";

// Settings at a section or a page one step in. Settings moves around itself this way too, so where it is lives in its
// tab's param, which is how Back and a restored session find it.
export const openSettings = (place: SettingsPlace) => void window.chromeAPI.browser.openPage("settings", { param: place });
