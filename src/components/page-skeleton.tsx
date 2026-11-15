import { ViewTransition, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Placeholders shaped like the redesigned screens that are about to arrive.
 */
export function SkeletonReveal({ children }: { children: ReactNode }) {
  return (
    <ViewTransition default="none" exit="skeleton-out">
      {children}
    </ViewTransition>
  );
}

function Bar({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded", className)} />;
}

function GroupedRows({ count }: { count: number }) {
  return (
    <div className="tx-activity-group">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="tx-activity-row">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Bar className="rounded-tile size-9 shrink-0" />
            <div className="flex-1 space-y-2">
              <Bar className="h-4 w-2/3" />
              <Bar className="h-3 w-1/3" />
            </div>
          </div>
          <Bar className="h-5 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({
  hero = false,
  controls = false,
  rows = 5,
}: {
  hero?: boolean;
  controls?: boolean;
  rows?: number;
}) {
  return (
    <SkeletonReveal>
      <div className="mx-auto max-w-4xl space-y-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading...</span>
        <div className="space-y-5" aria-hidden="true">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <Bar className="rounded-pill h-9 w-28" />
            <Bar className="rounded-pill h-9 w-32" />
          </div>
          {hero ? <div className="skeleton rounded-hero h-36" /> : null}
          {controls ? (
            <>
              <div className="skeleton rounded-card h-11" />
              <div className="skeleton rounded-pill h-9" />
            </>
          ) : null}
          <GroupedRows count={rows} />
        </div>
      </div>
    </SkeletonReveal>
  );
}

export function AccountsSkeleton() {
  return (
    <SkeletonReveal>
      <div className="mx-auto max-w-4xl space-y-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading accounts...</span>
        <div className="space-y-6" aria-hidden="true">
          <div className="flex items-center justify-between gap-3">
            <Bar className="rounded-pill h-9 w-28" />
            <Bar className="rounded-pill h-9 w-36" />
          </div>
          {[3, 2].map((count, groupIndex) => (
            <div key={groupIndex} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <Bar className="h-5 w-24" />
                <Bar className="h-5 w-20" />
              </div>
              <GroupedRows count={count} />
            </div>
          ))}
        </div>
      </div>
    </SkeletonReveal>
  );
}

export function BudgetsSkeleton() {
  return (
    <SkeletonReveal>
      <div className="mx-auto max-w-4xl space-y-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading budgets...</span>
        <div className="space-y-6" aria-hidden="true">
          <div className="flex items-center justify-between gap-3">
            <Bar className="rounded-pill h-9 w-28" />
            <Bar className="rounded-pill h-9 w-32" />
          </div>
          <div className="proto-card budget-summary-card">
            <Bar className="size-[120px] shrink-0 rounded-full" />
            <div className="flex-1 space-y-2.5">
              <Bar className="h-7 w-28" />
              <Bar className="h-4 w-36" />
              <Bar className="h-4 w-48" />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="proto-card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Bar className="rounded-tile size-9" />
                    <Bar className="h-4 w-28" />
                  </div>
                  <Bar className="h-4 w-24" />
                </div>
                <Bar className="rounded-pill h-2 w-full" />
                <div className="flex justify-between">
                  <Bar className="h-3.5 w-24" />
                  <Bar className="h-3.5 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonReveal>
  );
}

export function ActivitySkeleton() {
  return (
    <SkeletonReveal>
      <div className="mx-auto max-w-4xl space-y-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading activity...</span>
        <div className="space-y-4" aria-hidden="true">
          <div className="flex items-center justify-between gap-2">
            <Bar className="h-7 w-40" />
            <Bar className="rounded-pill h-9 w-28" />
          </div>
          <Bar className="rounded-pill h-9 w-full" />
          <Bar className="rounded-pill h-11 w-full" />
          <div className="flex gap-2 overflow-hidden">
            {[72, 84, 76, 88].map((w, i) => (
              <div key={i} className="skeleton rounded-pill h-[34px] shrink-0" style={{ width: w }} />
            ))}
          </div>
          <div className="stat-group">
            {[0, 1, 2].map((cell) => (
              <div key={cell} className="stat-cell">
                <Bar className="h-3.5 w-12" />
                <Bar className="mt-1 h-5 w-16" />
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex justify-between px-1">
              <Bar className="h-4 w-24" />
              <Bar className="h-4 w-20" />
            </div>
            <GroupedRows count={5} />
          </div>
        </div>
      </div>
    </SkeletonReveal>
  );
}

export function InsightsSkeleton() {
  return (
    <SkeletonReveal>
      <div className="mx-auto max-w-4xl space-y-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading insights...</span>
        <div className="space-y-5" aria-hidden="true">
          <div className="flex items-center justify-between gap-3">
            <Bar className="h-5 w-28" />
            <Bar className="rounded-pill h-9 w-28" />
          </div>
          <Bar className="h-8 w-44" />
          <Bar className="rounded-pill h-11 w-full" />
          <div className="proto-card flex items-center justify-center py-8">
            <Bar className="size-48 rounded-full" />
          </div>
          <GroupedRows count={4} />
        </div>
      </div>
    </SkeletonReveal>
  );
}

export function AddSkeleton() {
  return (
    <SkeletonReveal>
      <div className="mx-auto max-w-md space-y-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading entry form...</span>
        <div className="space-y-4" aria-hidden="true">
          <Bar className="rounded-pill h-9 w-full" />
          <div className="amount-stage gap-2 py-2">
            <Bar className="h-11 w-40 rounded-xl" />
            <Bar className="h-4 w-28" />
          </div>
          <div className="flex gap-2 overflow-hidden">
            {[96, 88, 100].map((w, i) => (
              <div key={i} className="skeleton rounded-pill h-9 shrink-0" style={{ width: w }} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, idx) => (
              <Bar key={idx} className="rounded-pill h-12 w-full" />
            ))}
          </div>
          <Bar className="rounded-pill h-[50px] w-full" />
        </div>
      </div>
    </SkeletonReveal>
  );
}

/** An entry screen: fields and capsule save button. */
export function FormSkeleton() {
  return (
    <SkeletonReveal>
      <div className="mx-auto max-w-2xl space-y-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading...</span>
        <div className="space-y-5" aria-hidden="true">
          <Bar className="h-4 w-56" />
          <Bar className="rounded-pill h-9 w-full" />
          <div className="proto-card space-y-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="space-y-2">
                <Bar className="h-3.5 w-20" />
                <Bar className="rounded-control h-11 w-full" />
              </div>
            ))}
          </div>
          <Bar className="rounded-pill h-[50px] w-full" />
        </div>
      </div>
    </SkeletonReveal>
  );
}

/** Settings screen placeholder matching inset grouped rows. */
export function SettingsSkeleton() {
  return (
    <SkeletonReveal>
      <div className="mx-auto max-w-2xl space-y-6" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading settings...</span>
        <div className="space-y-6" aria-hidden="true">
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-row-left">
                <Bar className="size-[30px] rounded-lg" />
                <Bar className="h-4 w-36" />
              </div>
              <Bar className="h-4 w-20" />
            </div>
          </div>
          <div className="space-y-2">
            <Bar className="ml-4 h-3.5 w-24" />
            <div className="settings-group">
              {[0, 1].map((row) => (
                <div key={row} className="settings-row">
                  <div className="settings-row-left">
                    <Bar className="size-[30px] rounded-lg" />
                    <Bar className="h-4 w-24" />
                  </div>
                  <Bar className="rounded-pill h-9 w-36" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Bar className="ml-4 h-3.5 w-28" />
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-row-left">
                  <Bar className="size-[30px] rounded-lg" />
                  <Bar className="h-4 w-28" />
                </div>
                <Bar className="h-4 w-24" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SkeletonReveal>
  );
}
