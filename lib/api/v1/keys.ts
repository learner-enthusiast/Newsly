import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "ds_live_";
/** Characters of the key shown in the UI (`ds_live_` + 4). */
export const API_KEY_DISPLAY_PREFIX_LENGTH = 12;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SECRET_BYTES = 32;
/** 62^43 > 2^256, so 43 chars always fit 32 bytes. */
const SECRET_LENGTH = 43;

const ZERO = BigInt(0);
const SIXTY_TWO = BigInt(62);

function toBase62(bytes: Buffer): string {
  let value = BigInt(`0x${bytes.toString("hex")}`);
  let out = "";
  while (value > ZERO) {
    out = BASE62[Number(value % SIXTY_TWO)] + out;
    value /= SIXTY_TWO;
  }
  return out.padStart(SECRET_LENGTH, "0");
}

/** Hex SHA-256; the only form of a key that is ever stored. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): {
  key: string;
  prefix: string;
  hashedKey: string;
} {
  const key = `${API_KEY_PREFIX}${toBase62(randomBytes(SECRET_BYTES))}`;
  return {
    key,
    prefix: key.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH),
    hashedKey: hashApiKey(key),
  };
}

/** Cheap shape check before hashing / hitting the DB. */
export function looksLikeApiKey(value: string): boolean {
  return (
    value.startsWith(API_KEY_PREFIX) &&
    value.length === API_KEY_PREFIX.length + SECRET_LENGTH &&
    /^[0-9A-Za-z]+$/.test(value.slice(API_KEY_PREFIX.length))
  );
}
