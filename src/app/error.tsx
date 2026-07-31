"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

/**
 * What the user sees when a page fails to render.
 *
 * A finance app needs this more than most. Without a boundary, one malformed row —
 * an amount the mapper refuses, a currency the union does not cover — replaces the
 * whole screen with a stack trace. Worse, the alternative temptation is to swallow
 * the error and render zeros, which is not "we could not load this" but a specific
 * and wrong claim about someone's money.
 *
 * So: say plainly that the figures could not be loaded, offer a retry, and never
 * show a number that might be wrong.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what ties this to the server log entry; without it a user
    // report is unactionable.
    console.error("Page failed to render:", error.message, error.digest);
  }, [error]);

  return (
    <div className="space-y-4 pt-6">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-start gap-2">
            <TriangleAlert size={20} className="text-outflow mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h1 className="text-ink text-lg font-bold">We could not load your figures</h1>
              <p className="text-ink-muted mt-1 text-sm">
                Nothing has been changed. Rather than show you numbers that might be
                wrong, we have shown you none.
              </p>
            </div>
          </div>

          <Button onClick={reset} size="full">
            <RefreshCw size={16} aria-hidden="true" />
            Try again
          </Button>

          {error.digest ? (
            <p className="text-ink-faint text-center text-xs">
              Reference {error.digest}
            </p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
