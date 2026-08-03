"use client";

import { useEffect, useRef, useState } from "react";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyTotal } from "@/lib/domain/transactions";
import type { CurrencyCode } from "@/lib/money";

type CashFlowChartComponent = typeof import("./cash-flow-chart").CashFlowChart;

/**
 * Loads Recharts only when the chart is close to the viewport.
 *
 * The dashboard's figures are useful before a chart is. Keeping the chart in a
 * separate client chunk removes Recharts from the initial route payload without
 * making the card jump when it becomes visible.
 */
export function DeferredCashFlowChart({
  series,
  currency,
}: {
  series: readonly DailyTotal[];
  currency: CurrencyCode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [Chart, setChart] = useState<CashFlowChartComponent | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element || Chart) return;

    const load = () => {
      void import("./cash-flow-chart").then((module) => setChart(() => module.CashFlowChart));
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
    <div ref={host}>
      {Chart ? (
        <Chart series={series} currency={currency} />
      ) : (
        <Card aria-busy="true" aria-label="Loading cash flow chart">
          <CardHeader>
            <CardTitle>Cash Flow</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="bg-surface-variant h-44 animate-pulse rounded-card" />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
