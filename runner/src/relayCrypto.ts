import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "crypto";
import { fieldsOf } from "../../src/shared/fields";

// The relay's keys, both made from RELAY_SECRET: one signs what it hands out and reads back, such as registered clients
// and refresh tokens, and one seals the connections it keeps across a restart.

export const b64 = (data: Buffer | string) => Buffer.from(data).toString("base64url");
export const hash = (token: string) => createHash("sha256").update(token).digest("base64url");
export const newToken = (kind: string) => `bb_${kind}_${randomBytes(32).toString("base64url")}`;

export const keysFrom = (secret: string) => ({
  sign: Buffer.from(hkdfSync("sha256", secret, "blueberry-relay", "sign", 32)),
  seal: Buffer.from(hkdfSync("sha256", secret, "blueberry-relay", "seal", 32)),
});
export type Keys = ReturnType<typeof keysFrom>;

export const mac = (keys: Keys, text: string) => createHmac("sha256", keys.sign).update(text).digest();
export const signed = (keys: Keys, data: object) => {
  const body = b64(JSON.stringify(data));
  return `${body}.${b64(mac(keys, body))}`;
};
export const unsigned = (keys: Keys, text: unknown): Record<string, unknown> | null => {
  if (typeof text !== "string" || text.length > 8000) return null;
  const [body, tag, extra] = text.split(".");
  if (!body || !tag || extra !== undefined) return null;
  const given = Buffer.from(tag, "base64url");
  const wanted = mac(keys, body);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    // Anything but an object is turned away by every caller anyway.
    return data !== null && typeof data === "object" ? fieldsOf(data) : null;
  } catch {
    return null;
  }
};

export const seal = (keys: Keys, text: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.seal, iv);
  const sealed = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return b64(Buffer.concat([iv, cipher.getAuthTag(), sealed]));
};
export const unseal = (keys: Keys, text: string): string | null => {
  try {
    const all = Buffer.from(text, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keys.seal, all.subarray(0, 12));
    decipher.setAuthTag(all.subarray(12, 28));
    return Buffer.concat([decipher.update(all.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
};
