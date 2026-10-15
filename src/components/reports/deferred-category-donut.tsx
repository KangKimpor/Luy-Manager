"use client";

import { useEffect, useRef, useState } from "react";

type ChartComponent = typeof import("./category-donut").CategoryDonut;

/** Match the existing report chart: import Recharts only near the viewport. */
export function DeferredCategoryDonut(props: React.ComponentProps<ChartComponent>) {
  const host = useRef<HTMLDivElement>(null);
  const [Chart, setChart] = useState<ChartComponent | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element || Chart) return;
    const load = () => { void import("./category-donut").then(module => setChart(() => module.CategoryDonut)).catch(() => setFailed(true)); };
    if (!("IntersectionObserver" in window)) { load(); return; }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect(); load();
    }, { rootMargin: "240px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [Chart]);
  return <div ref={host} className="h-60 min-w-0" aria-busy={!Chart && !failed}>
    {Chart ? <Chart {...props} /> : failed ? <p role="status" className="flex h-full items-center justify-center text-sm text-ink-muted">The chart could not load. The ranked list is still available.</p> : <div className="skeleton h-full rounded-2xl"><span className="sr-only">Loading category chart...</span></div>}
  </div>;
}
