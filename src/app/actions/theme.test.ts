import { expect, test, vi } from "vitest";
const { set } = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set }) }));
import { setTheme } from "./theme";

test("persists a valid theme and rejects untrusted values", async () => {
  const form = new FormData(); form.set("theme", "dark");
  await setTheme(form);
  expect(set).toHaveBeenCalledWith("luy.theme", "dark", expect.objectContaining({ path: "/", sameSite: "lax", httpOnly: true }));
  form.set("theme", "other");
  await expect(setTheme(form)).rejects.toThrow("Choose Light");
});
