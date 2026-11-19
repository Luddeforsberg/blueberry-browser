import { createServer } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { relayConfig, startRelay } from "./relay";
import {
  asOwner,
  authorizeUrl,
  connect,
  dataOf,
  OWNER,
  origin,
  pkce,
  REDIRECT,
  register,
  RUNNER,
  runnerDb,
  signInAt,
  STRANGER,
  supabase,
  textOf,
  token,
  setUpRelay,
} from "./relayTesting";

// The relay against the real migrations in Postgres, through the fake Supabase: OAuth as the owner, a job started as them,
// taken by the runner as any other, and nothing that can answer what it asks.

setUpRelay();

describe("relayConfig", () => {
  it("is off with neither, and says what's missing with one", () => {
    expect(relayConfig({})).toBeNull();
    expect(relayConfig({ RELAY_PUBLIC_URL: "https://a.example" })).toMatch(/both/);
    expect(relayConfig({ RELAY_PUBLIC_URL: "http://a.example", RELAY_SECRET: "x".repeat(40) })).toMatch(/https/);
    expect(relayConfig({ RELAY_PUBLIC_URL: "https://a.example/mcp", RELAY_SECRET: "short" })).toMatch(/32/);
    expect(relayConfig({ RELAY_PUBLIC_URL: "https://a.example/mcp", RELAY_SECRET: "x".repeat(40), PORT: "3000" })).toEqual({
      origin: "https://a.example",
      secret: "x".repeat(40),
      port: 3000,
    });
  });
});

describe("startRelay", () => {
  it("says it couldn't start when its port is taken, rather than that it's listening", async () => {
    const taken = createServer();
    await new Promise<void>((resolve) => taken.listen(0, resolve));
    const port = (taken.address() as AddressInfo).port;
    const config = { origin: "https://relay.example", secret: "x".repeat(40), port };
    try {
      await expect(
        startRelay(config, { url: supabase.env.SUPABASE_URL, key: supabase.env.SUPABASE_PUBLISHABLE_KEY, owner: OWNER }, runnerDb),
      ).rejects.toThrow(/EADDRINUSE/);
    } finally {
      taken.close();
    }
  });
});

describe("OAuth", () => {
  it("advertises itself and asks for a token with WWW-Authenticate", async () => {
    const metadata = await (await fetch(`${origin}/.well-known/oauth-authorization-server`)).json();
    expect(metadata).toMatchObject({ code_challenge_methods_supported: ["S256"], registration_endpoint: `${origin}/register` });
    const resource = await (await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(resource).toMatchObject({ resource: `${origin}/mcp`, authorization_servers: [`${origin}/`] });
    const refused = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toContain(`resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`);
  });

  it("registers, signs in the owner with PKCE, refuses a wrong verifier, and refreshes", async () => {
    const client = await (await register()).json();
    const { verifier, challenge } = pkce();
    const signedIn = await signInAt(authorizeUrl(client.client_id, challenge), OWNER);
    expect(signedIn.status).toBe(302);
    const back = new URL(signedIn.headers.get("location")!);
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get("state")).toBe("xyz");
    const code = back.searchParams.get("code")!;

    const wrong = await token({
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      code_verifier: pkce().verifier,
      redirect_uri: REDIRECT,
    });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toBe("invalid_grant");

    const tokens = await (
      await token({ grant_type: "authorization_code", client_id: client.client_id, code, code_verifier: verifier, redirect_uri: REDIRECT })
    ).json();
    expect(tokens).toMatchObject({ token_type: "bearer", expires_in: 3600 });
    expect(tokens.access_token).toMatch(/^bb_at_/);
    // Nothing of Supabase's goes out.
    expect(JSON.stringify(tokens)).not.toMatch(/access-|refresh-/);
    // A code works once.
    expect(
      (
        await token({
          grant_type: "authorization_code",
          client_id: client.client_id,
          code,
          code_verifier: verifier,
          redirect_uri: REDIRECT,
        })
      ).status,
    ).toBe(400);

    const refreshed = await (
      await token({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: tokens.refresh_token })
    ).json();
    expect(refreshed.access_token).toMatch(/^bb_at_/);
    expect(refreshed.access_token).not.toBe(tokens.access_token);
    // The old refresh token coming back ends the whole connection, the new one with it.
    expect((await token({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: tokens.refresh_token })).status).toBe(
      400,
    );
    expect((await token({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: refreshed.refresh_token })).status).toBe(
      400,
    );
    // And its grant is revoked in the database, not only forgotten here.
    expect(await supabase.cloudRows("select count(*)::int as n from public.cloud_relay_grants where revoked_at is null")).toEqual([
      { n: 0 },
    ]);
  });

  it("refuses any account but the owner's, without sending its password anywhere", async () => {
    const client = await (await register()).json();
    const before = supabase.received.length;
    const refused = await signInAt(authorizeUrl(client.client_id, pkce().challenge), STRANGER);
    expect(refused.status).toBe(200);
    expect(await refused.text()).toContain("Only the Blueberry account this is set up for can connect here.");
    expect(supabase.received.slice(before).some(({ body }) => body.includes(STRANGER))).toBe(false);
    // However often, a stranger never uses up the owner's tries.
    for (let n = 0; n < 60; n++) await signInAt(authorizeUrl(client.client_id, pkce().challenge), STRANGER);
    expect((await signInAt(authorizeUrl(client.client_id, pkce().challenge), OWNER)).status).toBe(302);

    const wrongPassword = await signInAt(authorizeUrl(client.client_id, pkce().challenge), OWNER, "not it");
    expect(await wrongPassword.text()).toContain("That email and password didn");
  });

  it("only lets ChatGPT, Claude or an app on the same computer register", async () => {
    expect((await register("https://evil.example/callback")).status).toBe(400);
    expect((await register("https://chatgpt.com/connector_platform_oauth_redirect")).status).toBe(201);
    expect((await register("https://claude.ai/api/mcp/auth_callback")).status).toBe(201);
  });
});

describe("the MCP endpoint", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect();
  }, 30_000);
  afterAll(() => client?.close());

  it("lists its tools, marks the read-only ones, and has none that answers", async () => {
    const { tools } = await client.listTools();
    expect(tools.map(({ name }) => name).sort()).toEqual(["get_job", "list_agents", "list_jobs", "start_job", "stop_job"]);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(["get_job", "list_agents", "list_jobs"].includes(tool.name));
  });

  it("lists the mascots as the Mac shared them", async () => {
    const agents = dataOf(await client.callTool({ name: "list_agents", arguments: {} }));
    expect(agents.map(({ name }: { name: string }) => name)).toEqual(["Berry", "Scout"]);
    expect(agents[1].sites).toEqual(["shop.example"]);
  });

  it("only narrows a mascot's sites", async () => {
    const outside = await client.callTool({ name: "start_job", arguments: { task: "Look", agent: "Scout", sites: ["other.example"] } });
    expect(outside.isError).toBe(true);
    const bad = await client.callTool({ name: "start_job", arguments: { task: "Look", sites: ["not a site"] } });
    expect(bad.isError).toBe(true);
    const none = await client.callTool({ name: "get_job", arguments: { jobId: "00000000-0000-0000-0000-000000000000" } });
    expect(none.isError).toBe(true);
  });

  it("starts a job as the user, which the runner takes like any other, and can't answer what it asks", async () => {
    const started = dataOf(
      await client.callTool({
        name: "start_job",
        arguments: { task: "Find the price of tea", agent: "Scout", sites: ["tea.shop.example"] },
      }),
    );
    expect(started.status).toBe("queued");
    const [row] = await supabase.cloudRows(
      `select j.prompt, j.mascot, j.action_approval, j.conversation_id::text, u.email from public.cloud_jobs j join auth.users u on u.id = j.owner where j.id = '${started.jobId}'`,
    );
    expect(row).toMatchObject({ prompt: "Find the price of tea", action_approval: "risky", email: OWNER, conversation_id: started.jobId });
    expect(row.mascot).toMatchObject({ id: "scout", sites: ["tea.shop.example"] });

    const claimed = await runnerDb.claim();
    expect(claimed?.id).toBe(started.jobId);
    await runnerDb.update(started.jobId, { status: "running", steps: [{ text: "Opened tea.shop.example", done: true }] });
    await runnerDb.ask(started.jobId, { kind: "question", text: "Which size?", need: null, site: null });
    const waiting = await client.callTool({ name: "get_job", arguments: { jobId: started.jobId } });
    expect(textOf(waiting)).toMatch(/^Titles, addresses, page text/);
    expect(dataOf(waiting)).toMatchObject({
      status: "waiting_for_user",
      steps: ["Opened tea.shop.example"],
      waitingFor: { kind: "question", question: "Which size?" },
    });

    await runnerDb.update(started.jobId, { status: "done", reply: "It's £4." });
    expect(dataOf(await client.callTool({ name: "get_job", arguments: { jobId: started.jobId } }))).toMatchObject({
      status: "done",
      reply: "It's £4.",
    });
    expect(dataOf(await client.callTool({ name: "list_jobs", arguments: {} }))).toEqual([
      { jobId: started.jobId, where: "cloud", status: "done" },
    ]);

    // Nothing from the relay ever decided anything, and after sign-in nothing went as the owner.
    expect(supabase.received.some(({ path }) => path.includes("decide_cloud_approval"))).toBe(false);
    expect(supabase.received.some(({ path }) => /start_cloud_job|my_cloud_jobs|\/rest\/v1\/cloud_/.test(path))).toBe(false);
  });

  it("a waiting job whose question was just answered shows as running", async () => {
    const started = dataOf(await client.callTool({ name: "start_job", arguments: { task: "Ask me" } }));
    await runnerDb.claim();
    const approval = await runnerDb.ask(started.jobId, { kind: "question", text: "Which?", need: null, site: null });
    await asOwner("decide_cloud_approval", { p_approval: approval, p_allow: true, p_answer: "The big one" });
    expect(dataOf(await client.callTool({ name: "get_job", arguments: { jobId: started.jobId } })).status).toBe("running");
    await runnerDb.update(started.jobId, { status: "done", reply: "Done" });
  });

  it("sends a job to the Mac only while it's there, and says so when it isn't", async () => {
    const offline = await client.callTool({ name: "start_job", arguments: { task: "On my Mac", where: "mac" } });
    expect(offline.isError).toBe(true);
    expect(textOf(offline)).toMatch(/Blueberry isn't open on the user's Mac/);
    const auto = dataOf(await client.callTool({ name: "start_job", arguments: { task: "Anywhere" } }));
    expect(auto.where).toBe("cloud");
    await runnerDb.claim();
    await runnerDb.update(auto.jobId, { status: "done", reply: "Done" });

    expect(await asOwner("mac_presence", { p_on: true })).toBe(true);
    const onMac = dataOf(await client.callTool({ name: "start_job", arguments: { task: "Anywhere, Mac first" } }));
    expect(onMac).toMatchObject({ where: "mac", status: "queued" });
    const cloud = dataOf(await client.callTool({ name: "start_job", arguments: { task: "Only the cloud", where: "cloud" } }));
    expect(cloud.where).toBe("cloud");
    // The runner takes the cloud's and never the Mac's.
    expect((await runnerDb.claim())?.id).toBe(cloud.jobId);
    expect(await runnerDb.claim()).toBeNull();
    await runnerDb.update(cloud.jobId, { status: "done", reply: "Done" });

    // Waiting on the Mac says only that.
    const [claimed] = await asOwner("mac_claim_job", {});
    expect(claimed.id).toBe(onMac.jobId);
    await asOwner("mac_update_job", { p_job: onMac.jobId, p_status: "waiting", p_steps: [{ text: "Opened the shop", done: true }] });
    expect(dataOf(await client.callTool({ name: "get_job", arguments: { jobId: onMac.jobId } }))).toMatchObject({
      where: "mac",
      status: "waiting_for_user",
      steps: ["Opened the shop"],
      waitingFor: { kind: "user_on_mac" },
    });
    expect(dataOf(await client.callTool({ name: "stop_job", arguments: { jobId: onMac.jobId } })).status).toBe("stopping");
    expect(await asOwner("mac_update_job", { p_job: onMac.jobId, p_status: "stopped", p_reply: "Stopped" })).toBe(true);
    expect(dataOf(await client.callTool({ name: "get_job", arguments: { jobId: onMac.jobId } }))).toMatchObject({
      status: "stopped",
      reply: "Stopped",
    });
    expect(await asOwner("mac_presence", { p_on: false })).toBe(false);
  });

  it("stops a job of its own", async () => {
    const started = dataOf(await client.callTool({ name: "start_job", arguments: { task: "Wait" } }));
    expect(dataOf(await client.callTool({ name: "stop_job", arguments: { jobId: started.jobId } })).status).toBe("stopping");
    expect(dataOf(await client.callTool({ name: "get_job", arguments: { jobId: started.jobId } })).status).toBe("stopped");
  });
});

describe("after Unlink", () => {
  it("ends the connection, and nothing it held works again", async () => {
    const client = await connect();
    expect((await client.callTool({ name: "list_agents", arguments: {} })).isError).toBeFalsy();
    await asOwner("unlink_cloud_runner", {});
    const refused = await client.callTool({ name: "start_job", arguments: { task: "Go" } });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toMatch(/has ended/);
    // The relay has let it go, so from then on the app is told to connect again.
    await expect(client.callTool({ name: "list_agents", arguments: {} })).rejects.toThrow(/refresh token/);
    await client.close();
    // Linked again, the old connection stays ended: a new one has to sign in.
    expect(await asOwner("link_cloud_runner", { p_email: RUNNER })).toBe(true);
    expect(await runnerDb.accept()).toBe(true);
  });
});
