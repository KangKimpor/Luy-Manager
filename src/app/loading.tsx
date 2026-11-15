import { SkeletonReveal } from "@/components/page-skeleton";

export default function Loading() {
  return (
    <SkeletonReveal>
      <div className="home-grid" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your figures...</span>

        <div className="home-col" aria-hidden="true">
          <section className="hero-panel order-1 space-y-4 lg:order-none">
            <div className="flex items-center justify-between">
              <div className="bg-on-hero/25 h-4 w-28 animate-pulse rounded" />
              <div className="bg-on-hero/20 rounded-pill h-8 w-24 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="bg-on-hero/25 h-11 w-48 animate-pulse rounded-xl" />
              <div className="bg-on-hero/20 h-4 w-40 animate-pulse rounded" />
            </div>
            <div className="bg-on-hero/20 rounded-pill h-2 w-full animate-pulse" />
            <div className="grid grid-cols-2 gap-2.5">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="bg-on-hero/15 h-20 animate-pulse rounded-2xl"
                />
              ))}
            </div>
            <div className="bg-on-hero/15 h-6 w-44 animate-pulse rounded" />
          </section>

          <section className="sec-wrap order-4 lg:order-none">
            <div className="sec-head">
              <div className="skeleton h-5 w-20 rounded" />
              <div className="skeleton h-4 w-20 rounded" />
            </div>
            <div className="tx-list-group space-y-4 p-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="skeleton rounded-tile size-9 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-1/2 rounded" />
                    <div className="skeleton h-3 w-1/3 rounded" />
                  </div>
                  <div className="skeleton h-4 w-16 rounded" />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="home-col" aria-hidden="true">
          <section className="sec-wrap order-3 lg:order-none">
            <div className="month-sec-head">
              <div className="skeleton h-5 w-36 rounded" />
              <div className="skeleton h-3.5 w-20 rounded" />
            </div>
            <div className="proto-card space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="space-y-1.5">
                    <div className="skeleton h-3.5 w-14 rounded" />
                    <div className="skeleton h-5 w-20 rounded" />
                  </div>
                ))}
              </div>
              <div className="skeleton h-3 w-48 rounded" />
              <div className="skeleton h-[76px] w-full rounded-xl" />
            </div>
          </section>

          <section className="sec-wrap order-5 lg:order-none">
            <div className="sec-head">
              <div className="skeleton h-5 w-24 rounded" />
              <div className="skeleton h-4 w-16 rounded" />
            </div>
            <div className="proto-card space-y-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between">
                    <div className="skeleton h-4 w-28 rounded" />
                    <div className="skeleton h-4 w-20 rounded" />
                  </div>
                  <div className="skeleton rounded-pill h-1.5 w-full" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </SkeletonReveal>
  );
}
