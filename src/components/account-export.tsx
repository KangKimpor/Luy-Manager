"use client";

import { Download, FileSpreadsheet, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export function AccountExport() {
  const [busy, setBusy] = useState<"mmbak" | "xlsx" | null>(null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  async function download(format: "mmbak" | "xlsx") {
    if (busy) return;
    setBusy(format); setFailed(false); setStatus("Preparing all your accounts and history...");
    try {
      const response = await fetch(`/api/export?format=${format}`, { cache: "no-store" });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || type.includes("json") || type.includes("text/html")) {
        const result = type.includes("json") ? await response.json() as { error?: string } : null;
        throw new Error(result?.error ?? "Sign in again, then try the export.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `Luy-Manager.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      // Revoking immediately can interrupt Safari while it opens the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("Your file is ready. Check your downloads.");
    } catch (error) {
      setFailed(true); setStatus(error instanceof Error ? error.message : "Could not download the export. Try again.");
    } finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Export your accounts</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        <p className="text-ink-muted text-sm">Download all accounts and their transaction history, including closed accounts. USD and KHR keep their original amounts.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="secondary" size="full" disabled={busy !== null} onClick={() => download("mmbak")}>
            {busy === "mmbak" ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}Money Manager .mmbak
          </Button>
          <Button variant="secondary" size="full" disabled={busy !== null} onClick={() => download("xlsx")}>
            {busy === "xlsx" ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={17} aria-hidden="true" />}Excel .xlsx
          </Button>
        </div>
        <p role={failed ? "alert" : "status"} className={failed ? "text-outflow text-xs" : "text-ink-muted text-xs"}>{status}</p>
      </CardBody>
    </Card>
  );
}
