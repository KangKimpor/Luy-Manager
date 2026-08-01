import { describe, expect, test } from "vitest";

import {
  connectUrl,
  createLinkToken,
  LINK_TOKEN_TTL_SECONDS,
  verifyLinkToken,
} from "./link";

const SECRET = "test-webhook-secret";
const OTHER_SECRET = "a-different-secret";
const USER = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2026-07-31T12:00:00.000Z");

describe("link tokens", () => {
  test("a fresh token round trips to the same user", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    expect(verifyLinkToken(token, SECRET, NOW)).toEqual({ ok: true, userId: USER });
  });

  test("fits inside Telegram's 64 character /start payload limit", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    expect(token.length).toBeLessThanOrEqual(64);
  });

  test("uses only characters Telegram allows in a /start payload", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("a token signed with another secret is rejected", () => {
    const token = createLinkToken(USER, OTHER_SECRET, NOW);
    expect(verifyLinkToken(token, SECRET, NOW)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  test("a tampered user id is rejected", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    const raw = Buffer.from(token, "base64url");
    // Flip a bit inside the user id, leaving the signature untouched.
    raw[0] ^= 0x01;
    expect(verifyLinkToken(raw.toString("base64url"), SECRET, NOW)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  test("extending the expiry without resigning is rejected", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    const raw = Buffer.from(token, "base64url");
    raw.writeUInt32BE(raw.readUInt32BE(16) + 86_400, 16);
    expect(verifyLinkToken(raw.toString("base64url"), SECRET, NOW)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  test("still valid one second before expiry", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    const justBefore = new Date(NOW.getTime() + (LINK_TOKEN_TTL_SECONDS - 1) * 1000);
    expect(verifyLinkToken(token, SECRET, justBefore).ok).toBe(true);
  });

  test("expired exactly at the boundary", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    const atExpiry = new Date(NOW.getTime() + LINK_TOKEN_TTL_SECONDS * 1000);
    expect(verifyLinkToken(token, SECRET, atExpiry)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  test.each(["", "not-base64!!", "AAAA", "x".repeat(100)])(
    "malformed input is refused: %s",
    (bad) => {
      expect(verifyLinkToken(bad, SECRET, NOW).ok).toBe(false);
    },
  );

  test("a non-uuid user id cannot be issued a token", () => {
    expect(() => createLinkToken("not-a-uuid", SECRET, NOW)).toThrow();
  });

  test("two users get different tokens", () => {
    const other = "99999999-8888-7777-6666-555555555555";
    expect(createLinkToken(USER, SECRET, NOW)).not.toBe(
      createLinkToken(other, SECRET, NOW),
    );
  });

  test("the deep link points at the bot and carries the token", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    expect(connectUrl("LuyManagerBot", token)).toBe(
      `https://t.me/LuyManagerBot?start=${token}`,
    );
  });
});
