import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A fresh folder for one of the publishing tests.
export const inTempDir = (name: string) => mkdtempSync(join(tmpdir(), `blueberry-publishing-${name}-`));
