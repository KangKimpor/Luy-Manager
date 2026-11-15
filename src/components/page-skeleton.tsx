import { ViewTransition, type ReactNode } from "react";

import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Placeholders shaped like the screen that is about to arrive.
 *
 * The root loading state is the dashboard's, and it used to stand in for every
 * route: tapping Accounts flashed a net worth card and two cash flow tiles, then
 * replaced them with a list. A placeholder that predicts the wrong layout is
 * worse than none, because the content visibly jumps when the real page lands.
 */

/**
 * Fades the placeholder out over the arriving content instead of cutting to it.
 * Only the exit is animated: the placeholder's own arrival is already covered by
 * the route fade in the root layout.
 */
export function SkeletonReveal({ children }: { children: ReactNode }) {
  return <ViewTransition default="none" exit="skeleton-out">{children}</ViewTransition>;
}

function Bar({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded", className)} />;
}

function Rows({ count }: { count: number }) {
  return (
    <Card>
      <CardBody className="space-y-5 pt-5">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Bar className="size-10 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Bar className="h-4 w-2/3" />
              <Bar className="h-3 w-1/3" />
            </div>
            <Bar className="h-5 w-16" />
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/** A list screen: a line of context, an optional summary block, then rows. */
export function ListSkeleton({ hero = false, controls = false, rows = 5 }: {
  /** The dark summary card that opens Accounts and Budgets. */
  hero?: boolean;
  /** The month stepper and view switch that open Activity and Reports. */
  controls?: boolean;
  rows?: number;
}) {
  return (
    <SkeletonReveal>
    <div className="mx-auto max-w-4xl space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading...</span>
      <div className="space-y-5" aria-hidden="true">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Bar className="h-4 w-44" />
          <Bar className="rounded-pill h-11 w-24" />
        </div>
        {hero ? <div className="skeleton rounded-card h-44" /> : null}
        {controls ? (
          <>
            <div className="skeleton rounded-card h-[3.25rem]" />
            <div className="skeleton h-[3.25rem] rounded-2xl" />
          </>
        ) : null}
        <Rows count={rows} />
      </div>
    </div>
    </SkeletonReveal>
  );
}

/** An entry screen: the amount well, then a column of fields and the save button. */
export function FormSkeleton() {
  return (
    <SkeletonReveal>
    <div className="mx-auto max-w-2xl space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading...</span>
      <div className="space-y-5" aria-hidden="true">
        <Bar className="h-4 w-56" />
        <div className="skeleton h-14 rounded-2xl" />
        <div className="skeleton rounded-card h-36" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-2">
            <Bar className="h-4 w-20" />
            <div className="skeleton h-11 rounded-xl" />
          </div>
        ))}
        <div className="skeleton h-13 rounded-2xl" />
      </div>
    </div>
    </SkeletonReveal>
  );
}
