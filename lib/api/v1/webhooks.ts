/**
 * Job webhooks: URL safety, signing and delivery.
 *
 * - Only `https://` URLs on public addresses. The host is resolved when the
 *   job is created and again at connect time (the socket's `lookup` rejects
 *   private addresses), so DNS rebinding can't reach internal services.
 * - Signature: `X-DS-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>`
 *   with `X-DS-Timestamp` (unix seconds). Receivers should reject timestamps
 *   older than 5 minutes.
 * - Redirects are not followed; any non-2xx is a failed attempt.
 *
 * `API_WEBHOOK_ALLOW_PRIVATE=true` lifts the address and https checks for
 * local development only (ignored in production).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { lookup as dnsLookupAsync } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { prisma } from "@/db";
import { ApiError } from "@/lib/api/v1/errors";

export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_SECRET_PREFIX = "whsec_";
const MAX_URL_LENGTH = 2048;

// ── Address checks ──

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True for loopback, private, link-local, CGNAT, documentation, multicast and reserved ranges. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d): judge the IPv4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1]!, "ipv4");
    return blocked.check(address, "ipv6");
  }
  return blocked.check(address, "ipv4");
}

function allowPrivate(): boolean {
  return process.env.API_WEBHOOK_ALLOW_PRIVATE === "true" && process.env.NODE_ENV !== "production";
}

function invalidUrl(message: string): ApiError {
  return new ApiError("invalid_request", message, {
    details: { fields: [{ in: "body", path: "webhookUrl", message }] },
  });
}

/** Parses and checks a webhook URL, resolving its host. Throws a 400 `ApiError`. */
export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  if (raw.length > MAX_URL_LENGTH) throw invalidUrl("webhookUrl is too long.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalidUrl("webhookUrl is not a valid URL.");
  }
  if (url.protocol !== "https:" && !(allowPrivate() && url.protocol === "http:")) {
    throw invalidUrl("webhookUrl must use https.");
  }
  if (url.username || url.password) throw invalidUrl("webhookUrl must not contain credentials.");
  if (allowPrivate()) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw invalidUrl("webhookUrl must point to a public host.");
  }
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dnsLookupAsync(host, { all: true })).map((a) => a.address);
    } catch {
      throw invalidUrl("webhookUrl host does not resolve.");
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw invalidUrl("webhookUrl must point to a public address.");
  }
  return url;
}

/** `dns.lookup` that refuses private addresses, used for the delivery socket. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as unknown as { address: string; family: number }[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || list.length === 0) {
      return callback(new Error(`Refusing to connect to non-public address for ${hostname}`), "", 0);
    }
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    }
    callback(null, list[0]!.address, list[0]!.family);
  });
};

// ── Signing ──

export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Reference verifier (the docs show the same logic for receivers). */
export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): boolean {
  const ts = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(ts) || Math.abs(now - ts) > (input.toleranceSeconds ?? 300)) return false;
  const expected = Buffer.from(signWebhookPayload(input.secret, ts, input.body));
  const given = Buffer.from(input.signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ── Delivery ──

export type WebhookDeliveryResult = { status: number };

/** One POST attempt. Throws on network errors, timeouts and non-2xx answers. */
export function postWebhook(input: {
  url: string;
  secret: string;
  deliveryId: string;
  event: string;
  payload: unknown;
  now?: Date;
}): Promise<WebhookDeliveryResult> {
  const body = JSON.stringify(input.payload);
  const timestamp = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const url = new URL(input.url);
  const isHttps = url.protocol === "https:";
  if (!isHttps && !allowPrivate()) {
    return Promise.reject(new Error("webhook URL must use https"));
  }
  const send = isHttps ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = send(
      url,
      {
        method: "POST",
        timeout: WEBHOOK_TIMEOUT_MS,
        ...(allowPrivate() ? {} : { lookup: publicOnlyLookup }),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "DainikSamachar-Webhooks/1",
          "X-DS-Event": input.event,
          "X-DS-Delivery": input.deliveryId,
          "X-DS-Timestamp": String(timestamp),
          "X-DS-Signature": signWebhookPayload(input.secret, timestamp, body),
        },
      },
      (res) => {
        res.resume();
        const status = res.statusCode ?? 0;
        if (status >= 200 && status < 300) resolve({ status });
        else reject(new Error(`webhook answered HTTP ${status}`));
      },
    );
    req.on("timeout", () => req.destroy(new Error("webhook timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

// ── Secrets ──

export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export async function getOrCreateWebhookSecret(userId: string): Promise<{
  secret: string;
  createdAt: Date;
  rotatedAt: Date | null;
}> {
  return prisma.apiWebhookSecret.upsert({
    where: { userId },
    create: { userId, secret: generateWebhookSecret() },
    update: {},
    select: { secret: true, createdAt: true, rotatedAt: true },
  });
}

/** New secret; webhooks signed after this use it. */
export async function rotateWebhookSecret(userId: string) {
  const secret = generateWebhookSecret();
  return prisma.apiWebhookSecret.upsert({
    where: { userId },
    create: { userId, secret },
    update: { secret, rotatedAt: new Date() },
    select: { secret: true, createdAt: true, rotatedAt: true },
  });
}
