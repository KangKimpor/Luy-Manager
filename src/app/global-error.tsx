"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * The last resort: a failure in the root layout itself.
 *
 * This replaces the entire document, so it has to render its own `<html>` and
 * `<body>`. Load the tokens directly, without depending on the failed layout or
 * its fonts and components. The system font keeps this screen self-contained.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
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
          background: "var(--color-surface-muted)",
          color: "var(--color-ink)",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
            Luy Manager could not start
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)", margin: "0 0 1.25rem" }}>
            Something failed before the app could load. Your data has not been
            touched.
          </p>
          <button
            type="button"
            onClick={unstable_retry}
            style={{
              minHeight: "2.75rem",
              width: "100%",
              borderRadius: "0.75rem",
              border: "none",
              background: "var(--color-brand)",
              color: "var(--color-on-action)",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "1rem" }}>
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
