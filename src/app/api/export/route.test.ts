import { beforeEach, describe, expect, test, vi } from "vitest";
import { exportFixture } from "@/lib/export/fixtures";

const mocks = vi.hoisted(() => ({ demo: false, user: { id: "owner" } as { id: string } | null, load: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUser: async () => mocks.user, isDemoMode: () => mocks.demo }));
vi.mock("@/lib/data/export", () => ({ loadAccountExport: mocks.load }));
import { GET } from "./route";

beforeEach(() => { mocks.demo = false; mocks.user = { id: "owner" }; mocks.load.mockReset().mockResolvedValue(exportFixture()); });
const request = (format: string) => new Request(`https://app.test/api/export?format=${format}`);

describe("private account downloads", () => {
  test("both formats are real attachments and cannot enter a shared cache", async () => {
    for (const format of ["xlsx", "mmbak"]) {
      const response = await GET(request(format));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-disposition")).toContain(`.${format}"`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes.length).toBeGreaterThan(1000);
      expect(String.fromCharCode(...bytes.slice(0, 2))).toBe(format === "xlsx" ? "PK" : "SQ");
    }
  });
  test("anonymous and invalid requests never read the ledger", async () => {
    mocks.user = null;
    expect((await GET(request("xlsx"))).status).toBe(401);
    expect((await GET(request("csv"))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  test("demo exports work, while failures do not disclose database or credential details", async () => {
    mocks.demo = true; mocks.user = null;
    expect((await GET(request("xlsx"))).status).toBe(200);
    mocks.load.mockRejectedValueOnce(new Error("private credential"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("mmbak"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("credential");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("credential");
    logged.mockRestore();
  });
});
