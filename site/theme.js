// Light or dark: the system's by default, or what the user chose on the phone page's Settings, kept in this browser only.
const KEPT = "blueberry.appearance";
const dark = matchMedia("(prefers-color-scheme: dark)");

const read = () => {
  try {
    const kept = localStorage.getItem(KEPT);
    return kept === "light" || kept === "dark" ? kept : "system";
  } catch {
    return "system";
  }
};
let chosen = read();

export const appearance = () => chosen;

const follow = () => document.documentElement.classList.toggle("dark", chosen === "dark" || (chosen === "system" && dark.matches));

export const setAppearance = (choice) => {
  chosen = choice === "light" || choice === "dark" ? choice : "system";
  try {
    if (chosen === "system") localStorage.removeItem(KEPT);
    else localStorage.setItem(KEPT, chosen);
  } catch {
    // A private window: it holds until the page closes.
  }
  follow();
};

follow();
dark.addEventListener("change", follow);
