import { expect, test } from "@playwright/test";
import { findChrome } from "../src/main/localChrome";
import { DEFAULT_LOOK, driveFeature } from "./features/driver";
import { FEATURES, layoutsOf } from "./features/map";
import { phoneBrowserMissing } from "./features/phone";

// Every feature in tests/features/map.ts still opens, in its first state, so one that can't fails `verify` rather than
// a baseline later. Each of its states is pictured by `pnpm run baseline`.
for (const feature of FEATURES) {
  test(`${feature.name} opens`, async () => {
    test.skip(feature.surface === "phone" && phoneBrowserMissing, "The phone page needs Google Chrome, or Edge on Windows");
    test.skip(feature.surface !== "phone" && !!feature.needs?.cloudBrowser && !findChrome(), "A cloud tab needs Google Chrome");
    test.setTimeout(60_000);
    const { png } = await driveFeature(feature, Object.keys(feature.states)[0], { ...DEFAULT_LOOK, layout: layoutsOf(feature)[0] });
    expect(png.length).toBeGreaterThan(0);
  });
}
