import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LOOK, driveFeature } from "./driver";
import { FEATURES, featureNamed, layoutsOf, type Feature, type Look } from "./map";
import { ENTRIES, readRequest, shotFile, type Entry } from "./shots";

// What scripts/drive.mjs asked for: one feature in one state and look, or every one of them for a baseline.
const request = readRequest();

const shotsFor = (feature: Feature): Array<{ state: string; look: Look }> => {
  if (request.feature) {
    const state = request.state ?? Object.keys(feature.states)[0];
    return [
      {
        state,
        look: {
          theme: request.theme ?? DEFAULT_LOOK.theme,
          layout: request.layout ?? layoutsOf(feature)[0],
          width: request.width ?? DEFAULT_LOOK.width,
        },
      },
    ];
  }
  return Object.keys(feature.states).flatMap((state) =>
    (["light", "dark"] as const).flatMap((theme) =>
      layoutsOf(feature).map((layout) => ({ state, look: { theme, layout, width: DEFAULT_LOOK.width } })),
    ),
  );
};

const features = request.feature ? [featureNamed(request.feature)] : FEATURES;
if (!features[0]) throw new Error(`No feature named "${request.feature}". The map has: ${FEATURES.map((each) => each.name).join(", ")}`);

for (const feature of features as Feature[]) {
  for (const { state, look } of shotsFor(feature)) {
    const file = shotFile({ feature: feature.name, state, look, layouts: feature.layouts, width: request.feature ? look.width : null });
    test(file, async () => {
      const { png, restless } = await driveFeature(feature, state, look);
      mkdirSync(join(request.out, ENTRIES), { recursive: true });
      writeFileSync(join(request.out, file), png);
      const entry: Entry = {
        feature: feature.name,
        state,
        theme: look.theme,
        layout: feature.layouts === "none" ? null : look.layout,
        width: look.width,
        file,
        restless,
        design: feature.design,
      };
      writeFileSync(join(request.out, ENTRIES, `${file}.json`), JSON.stringify(entry));
      console.log(`Saved ${join(request.out, file)}${restless ? `, but it kept changing at ${restless}` : ""}`);
    });
  }
}
