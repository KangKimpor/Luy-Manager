"use client";

import { useEffect } from "react";

/**
 * The last resort: a failure in the root layout itself.
 *
 * This replaces the entire document, so it has to render its own `<html>` and
 * `<body>` and cannot rely on the app's fonts, styles or components — the failure
 * may well be in whatever provides them. Everything here is inline on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout failed:", error.message, error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
          // Literals on purpose: this renders when the root layout has failed, so
          // it cannot rely on the stylesheet or any import. Kept in step with
          // --color-surface-muted and --color-ink by hand.
          background: "#f9f9ff",
          color: "#181c24",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
            Luy Manager could not start
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#5b6472", margin: "0 0 1.25rem" }}>
            Something failed before the app could load. Your data has not been
            touched.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "2.75rem",
              width: "100%",
              borderRadius: "0.75rem",
              border: "none",
              background: "#4c5fd5",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#9aa1ad", marginTop: "1rem" }}>
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
