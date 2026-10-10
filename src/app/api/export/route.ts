import { getUser, isDemoMode } from "@/lib/auth";
import { loadAccountExport } from "@/lib/data/export";

export const runtime = "nodejs";
export const maxDuration = 60;

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request): Promise<Response> {
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "mmbak" && format !== "xlsx") return Response.json({ error: "Choose a .mmbak backup or an Excel workbook." }, { status: 400, headers: PRIVATE_HEADERS });
  if (!isDemoMode() && !await getUser()) return Response.json({ error: "Sign in to export your data." }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const data = await loadAccountExport();
    const bytes = format === "mmbak"
      ? await (await import("@/lib/export/mmbak")).buildMmbak(data)
      : (await import("@/lib/export/xlsx")).buildXlsx(data);
    const stamp = data.exportedAt.replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": format === "mmbak" ? "application/x-sqlite3" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Luy-Manager-${stamp}.${format}"`,
    } });
  } catch {
    console.error("[export] Could not produce a complete account export.");
    return Response.json({ error: "The export could not finish. Wait for any entries to finish saving, then try again." }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
