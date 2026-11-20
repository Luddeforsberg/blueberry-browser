import { defineRailway, preserve, service } from "railway/iac";

// The cloud runner's service on Railway, read by `railway config plan` and `railway config apply`, which replaced
// railway.json. Only this service is described, so nothing else in the project is touched. Its variables are set in the
// dashboard and stay as they are there: each one it reads is named here only to keep it, because a variable left out
// would be deleted. runner/README.md says what each is.
export const partial = "runner";

const KEPT = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "BLUEBERRY_RUNNER_EMAIL",
  "BLUEBERRY_RUNNER_PASSWORD",
  "BLUEBERRY_RUNNER_OWNER",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "BROWSERBASE_API_KEY",
  "BROWSERBASE_PROJECT_ID",
  "BROWSERBASE_CONTEXT_ID",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "RELAY_PUBLIC_URL",
  "RELAY_SECRET",
  "RELAY_STATE_FILE",
];

export default defineRailway((context, project) => {
  if (!context.projectName) throw new Error("Link this folder to the runner's Railway project first, with `railway link`.");
  const runner = service("runner", {
    build: { builder: "DOCKERFILE", dockerfilePath: "runner/Dockerfile" },
    deploy: { numReplicas: 1, restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    env: Object.fromEntries(KEPT.map((name) => [name, preserve()])),
  });
  return project(context.projectName, { resources: [runner] });
});
