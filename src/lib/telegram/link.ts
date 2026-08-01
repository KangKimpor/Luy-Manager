import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Linking a Telegram chat to an app account.
 *
 * The bot has to know which user a chat belongs to before it can write anything,
 * and Telegram gives us only a chat id. Something has to connect the two.
 *
 * ## Why a signed token and not a stored code
 *
 * The obvious design is a `telegram_link_codes` table: generate a six-digit code,
 * store it with an expiry, look it up when the user sends it. That works, and it
 * costs a migration, a write on every attempt, a read on every attempt, and a
 * cleanup job for expired rows.
 *
 * None of that is necessary, because the code does not need to be *remembered*, it
 * needs to be *authenticated*. An HMAC over the user id and an expiry does that
 * with no storage at all: the server can verify a token it never saw before,
 * because only the server could have produced the signature.
 *
 * The link is then a normal Telegram deep link, so connecting is one tap from the
 * settings page rather than copying a code between two apps.
 *
 * ## Why the byte packing
 *
 * Telegram restricts a `/start` payload to 64 characters from `A-Za-z0-9_-`. That
 * rules out a delimiter-separated string: a UUID alone is 36 characters, and with
 * an expiry and a full 32-byte signature this would be roughly 100. So the parts
 * are packed as fixed-width binary and base64url encoded, which is exactly the
 * allowed alphabet:
 *
 *   16 bytes  user id, the UUID as raw bytes rather than 36 hex characters
 *    4 bytes  expiry, seconds since the epoch, big endian
 *   10 bytes  truncated HMAC-SHA256
 *   --------
 *   30 bytes  ->  40 base64url characters, inside the limit
 *
 * Truncating the signature to 80 bits is deliberate and safe here: the token lives
 * for minutes, is single-purpose, and a forgery attempt is an online guess against
 * a server that can rate limit. 80 bits is far beyond feasible for that.
 */

/** How long a connect link stays valid. Long enough to switch apps, short enough to matter. */
export const LINK_TOKEN_TTL_SECONDS = 15 * 60;

const USER_ID_BYTES = 16;
const EXPIRY_BYTES = 4;
const SIGNATURE_BYTES = 10;
const TOKEN_BYTES = USER_ID_BYTES + EXPIRY_BYTES + SIGNATURE_BYTES;

function uuidToBytes(userId: string): Buffer {
  const hex = userId.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error("A link token can only be issued for a UUID user id.");
  }
  return Buffer.from(hex, "hex");
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function sign(payload: Buffer, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest().subarray(0, SIGNATURE_BYTES);
}

/**
 * Issue a connect token for one user.
 *
 * `now` is injected so the expiry logic is testable without waiting or mocking a
 * global clock.
 */
export function createLinkToken(
  userId: string,
  secret: string,
  now: Date = new Date(),
): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + LINK_TOKEN_TTL_SECONDS;

  const payload = Buffer.alloc(USER_ID_BYTES + EXPIRY_BYTES);
  uuidToBytes(userId).copy(payload, 0);
  payload.writeUInt32BE(expiresAt, USER_ID_BYTES);

  return Buffer.concat([payload, sign(payload, secret)]).toString("base64url");
}

export type LinkTokenResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

/**
 * Verify a token and recover the user id.
 *
 * Returns a reason rather than throwing, because the caller replies to a human and
 * "that link expired, generate a new one" is a different message from "that is not
 * a valid link".
 */
export function verifyLinkToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): LinkTokenResult {
  let raw: Buffer;
  try {
    raw = Buffer.from(token, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (raw.length !== TOKEN_BYTES) return { ok: false, reason: "malformed" };

  const payload = raw.subarray(0, USER_ID_BYTES + EXPIRY_BYTES);
  const presented = raw.subarray(USER_ID_BYTES + EXPIRY_BYTES);
  const expected = sign(payload, secret);

  // Constant time: both are the same fixed width, so this cannot throw and does
  // not leak how much of the signature matched.
  if (!timingSafeEqual(presented, expected)) return { ok: false, reason: "bad-signature" };

  // Checked only after the signature, so an attacker learns nothing about timing
  // from an unsigned token with a plausible expiry.
  const expiresAt = payload.readUInt32BE(USER_ID_BYTES);
  if (Math.floor(now.getTime() / 1000) >= expiresAt) return { ok: false, reason: "expired" };

  return { ok: true, userId: bytesToUuid(payload.subarray(0, USER_ID_BYTES)) };
}

/** The one-tap deep link that opens the bot and sends the token as /start payload. */
export function connectUrl(botUsername: string, token: string): string {
  return `https://t.me/${botUsername}?start=${token}`;
}
