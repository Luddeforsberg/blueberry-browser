const dark = matchMedia("(prefers-color-scheme: dark)");
const follow = () => document.documentElement.classList.toggle("dark", dark.matches);
follow();
dark.addEventListener("change", follow);
