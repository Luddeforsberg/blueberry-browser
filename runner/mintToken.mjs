// Makes the runner's token: a JWT for the `blueberry_runner` role and one user, signed with your project's JWT secret.
// Run it on your own computer. The secret stays there, and only the token goes to Railway as BLUEBERRY_RUNNER_TOKEN.
//
//   SUPABASE_JWT_SECRET=... node runner/mintToken.mjs <your user id> [days, default 365]
import { createHmac } from "node:crypto";

const [userId, days = "365"] = process.argv.slice(2);
const secret = process.env.SUPABASE_JWT_SECRET;
if (!secret || !/^[0-9a-f-]{36}$/i.test(userId ?? "")) {
  console.error("Usage: SUPABASE_JWT_SECRET=... node runner/mintToken.mjs <your user id from Authentication > Users> [days]");
  process.exit(1);
}
const now = Math.floor(Date.now() / 1000);
const claims = { role: "blueberry_runner", sub: userId, aud: "authenticated", iat: now, exp: now + Number(days) * 86_400 };
const unsigned = [{ alg: "HS256", typ: "JWT" }, claims].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".");
console.log(`${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`);
