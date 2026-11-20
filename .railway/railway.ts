import { defineRailway, preserve, service, volume } from "railway/iac";

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
  "FIRECRAWL_API_KEY",
  "LLM_TITLE_MODEL",
  "OPENAI_BASE_URL",
  "BLUEBERRY_RUNNER_CDP",
  "BLUEBERRY_RUNNER_CHROME",
  "BLUEBERRY_RUNNER_POLL_MS",
  "TZ",
  // Set by hand before this file, and now the same as build.dockerfilePath below. Kept, as it's still on the service.
  "RAILWAY_DOCKERFILE_PATH",
];

export default defineRailway((context, project) => {
  if (!context.projectName) throw new Error("Link this folder to the runner's Railway project first, with `railway link`.");
  // Where RELAY_STATE_FILE keeps the relay's connections, so ChatGPT and Claude stay signed in across deploys. A volume
  // left out of this file would be taken off the service.
  const data = volume("runner-volume");
  const runner = service("runner", {
    build: { builder: "DOCKERFILE", dockerfilePath: "runner/Dockerfile" },
    deploy: { numReplicas: 1, restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    env: Object.fromEntries(KEPT.map((name) => [name, preserve()])),
    volumeMounts: { "/data": data },
  });
  return project(context.projectName, { resources: [runner, data] });
});
