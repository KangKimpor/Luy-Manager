import { describe, expect, it } from "vitest";
import { withActionFeedback } from "./action-feedback";

describe("withActionFeedback", () => {
  it("preserves an action validation error", async () => {
    const result = { ok: false, error: "Choose an account." } as const;
    expect(await withActionFeedback(async () => result, "Connection lost.")).toEqual(result);
  });

  it("returns an actionable error when a server response is lost", async () => {
    expect(await withActionFeedback(async () => { throw new TypeError("Failed to fetch"); }, "Check Activity before trying again.")).toEqual({ ok: false, error: "Check Activity before trying again." });
  });
});
