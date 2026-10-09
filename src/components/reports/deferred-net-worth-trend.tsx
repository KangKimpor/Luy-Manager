"use client";

import { useEffect, useRef, useState } from "react";

import type { CurrencyCode } from "@/lib/money";

type NetWorthTrendComponent = typeof import("./net-worth-trend").NetWorthTrend;

/** Loads the reports chart only after it approaches the viewport. */
export function DeferredNetWorthTrend({
  points,
  currency,
}: {
  points: ReadonlyArray<{ label: string; minor: number }>;
  currency: CurrencyCode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [Chart, setChart] = useState<NetWorthTrendComponent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element || Chart) return;

    const load = () => {
      void import("./net-worth-trend")
        .then((module) => setChart(() => module.NetWorthTrend))
        .catch(() => setFailed(true));
    };

    if (!("IntersectionObserver" in window)) {
      load();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [Chart]);

  return (
    <div ref={host} className={Chart || failed ? "h-52 min-w-0" : "h-52 min-w-0 animate-pulse rounded-2xl bg-surface-container-low"} aria-busy={!Chart && !failed}>
      {Chart ? <Chart points={points} currency={currency} /> : failed ? <p role="status" className="flex h-full items-center justify-center text-center text-sm text-ink-muted">The chart could not load. Refresh to try again.</p> : <span className="sr-only">Loading balance chart...</span>}
    </div>
  );
}
