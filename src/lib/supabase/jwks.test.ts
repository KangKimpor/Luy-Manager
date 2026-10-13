import { expect, test, vi } from "vitest";
import { checkJwtSigning } from "../../../scripts/check-jwt-signing.mjs";

test("warns for empty keys, without failing the connection check", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ keys: [] }));
  expect(await checkJwtSigning("https://example.test", "anon", fetcher)).toContain("network call per request");
  expect(fetcher.mock.calls[0][0]).toBe("https://example.test/auth/v1/.well-known/jwks.json");
});
test("accepts public keys and treats diagnostic failures as warnings", async () => {
  expect(await checkJwtSigning("https://example.test", "anon", vi.fn().mockResolvedValue(Response.json({ keys: [{ kty: "EC" }] })))).toBeNull();
  expect(await checkJwtSigning("https://example.test", "anon", vi.fn().mockRejectedValue(new Error("offline")))).toContain("Could not check");
});
