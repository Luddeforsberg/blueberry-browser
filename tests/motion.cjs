// Loaded into every test app's main process, after any preload a test adds. The tests expect a computer that allows
// motion, where the mascot flies and types at a pace, and GitHub's macOS and Windows runners turn motion down, as anyone
// can in their system's settings. Main reads that setting and so do the pages, so both are told it's on. A test of
// reduced motion asks for it itself, and a preload that forces it, as `drive` does, keeps it.
const electron = require("electron");

if (!electron.app.commandLine.hasSwitch("force-prefers-reduced-motion")) {
  electron.app.commandLine.appendSwitch("force-prefers-no-reduced-motion");
  const { systemPreferences } = electron;
  const animationSettings = systemPreferences.getAnimationSettings.bind(systemPreferences);
  systemPreferences.getAnimationSettings = () => ({ ...animationSettings(), prefersReducedMotion: false });
}
