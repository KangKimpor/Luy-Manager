import { expect, test, vi } from "vitest";
const context = vi.hoisted(() => vi.fn());
vi.mock("./client", async original => ({ ...await original<typeof import("./client")>(), dataContext: context }));
import { merchantLookup } from "./reference";

test("merchant reads are owner scoped and chunked, and demo needs no query", async () => {
  const eq = vi.fn().mockReturnThis();
  const within = vi.fn().mockResolvedValue({ data: [], error: null });
  context.mockResolvedValue({ userId: "owner", supabase: { from: () => ({ select: () => ({ eq, in: within }) }) } });
  await merchantLookup(Array.from({ length: 101 }, (_, index) => `m-${index}`));
  expect(eq).toHaveBeenCalledWith("user_id", "owner");
  expect(within.mock.calls.map(call => call[1].length)).toEqual([100, 1]);
  context.mockResolvedValue(null);
  expect(await merchantLookup(["m"])).toEqual({});
});
