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

  useEffect(() => {
    const element = host.current;
    if (!element || Chart) return;

    const load = () => {
      void import("./net-worth-trend").then((module) => setChart(() => module.NetWorthTrend));
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
    <div ref={host} className="bg-surface-variant h-44 animate-pulse rounded-card" aria-busy={!Chart}>
      {Chart ? <Chart points={points} currency={currency} /> : null}
    </div>
  );
}
