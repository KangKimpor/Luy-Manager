import { Card, CardBody } from "@/components/ui/card";

/**
 * Shown while a page's data is in flight.
 *
 * Deliberately a skeleton of the right shape rather than a spinner: every page in
 * this app leads with a large figure, and a layout that jumps when the number
 * arrives is what makes an app feel unreliable about the number.
 *
 * No placeholder digits. A greyed-out "$0.00" would be read as a balance.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your figures…</span>

      <div className="space-y-2">
        <div className="bg-surface-muted h-7 w-32 animate-pulse rounded" />
        <div className="bg-surface-muted h-4 w-48 animate-pulse rounded" />
      </div>

      <Card className="from-brand to-brand-strong bg-gradient-to-br p-5">
        <div className="h-3 w-20 animate-pulse rounded bg-white/30" />
        <div className="mt-2 h-8 w-40 animate-pulse rounded bg-white/30" />
        <div className="mt-4 h-3 w-32 animate-pulse rounded bg-white/20" />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="p-4">
            <div className="bg-surface-muted h-3 w-16 animate-pulse rounded" />
            <div className="bg-surface-muted mt-3 h-5 w-24 animate-pulse rounded" />
          </Card>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-3">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="bg-surface-muted size-9 shrink-0 animate-pulse rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="bg-surface-muted h-3.5 w-2/3 animate-pulse rounded" />
                <div className="bg-surface-muted h-3 w-1/3 animate-pulse rounded" />
              </div>
              <div className="bg-surface-muted h-4 w-16 shrink-0 animate-pulse rounded" />
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
