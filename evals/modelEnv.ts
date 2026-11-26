import { join } from "node:path";
import { config as readEnv } from "dotenv";

// What .env holds, read without touching this process's environment, so the values go only to the app, the same way the
// tests pass theirs. Link .env from the main checkout first.
export const readModelEnv = (): Record<string, string> => {
  const { parsed } = readEnv({
    path: join(__dirname, "../.env"),
    processEnv: {},
  });
  if (!parsed?.OPENAI_API_KEY && !parsed?.ANTHROPIC_API_KEY) throw new Error("Link .env from the main checkout first.");
  return parsed;
};
