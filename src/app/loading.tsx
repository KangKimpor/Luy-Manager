import { Card, CardBody } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="page-enter space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your figures...</span>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" aria-hidden="true">
        <Card className="border-0 bg-ink p-6 sm:p-8">
          <div className="bg-surface/25 h-4 w-24 animate-pulse rounded" />
          <div className="bg-surface/25 mt-6 h-12 w-52 animate-pulse rounded-xl" />
          <div className="bg-surface/20 mt-4 h-4 w-36 animate-pulse rounded" />
          <div className="bg-surface/20 mt-8 h-4 w-44 animate-pulse rounded" />
        </Card>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map(index => <Card key={index} className="space-y-4 p-5"><div className="size-10 animate-pulse rounded-2xl bg-surface-container" /><div className="h-3 w-16 animate-pulse rounded bg-surface-container" /><div className="h-7 w-full animate-pulse rounded bg-surface-container" /><div className="h-3 w-20 animate-pulse rounded bg-surface-container" /></Card>)}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3" aria-hidden="true">{[0, 1, 2].map(index => <Card key={index} className="flex h-20 items-center justify-center"><div className="h-4 w-16 animate-pulse rounded bg-surface-container" /></Card>)}</div>
      <Card aria-hidden="true"><CardBody className="space-y-5 pt-5">
        {[0, 1, 2, 3, 4].map(index => <div key={index} className="flex items-center gap-3"><div className="bg-surface-container size-10 shrink-0 animate-pulse rounded-2xl" /><div className="flex-1 space-y-2"><div className="bg-surface-container h-4 w-2/3 animate-pulse rounded" /><div className="bg-surface-container h-3 w-1/3 animate-pulse rounded" /></div><div className="bg-surface-container h-5 w-16 animate-pulse rounded" /></div>)}
      </CardBody></Card>
    </div>
  );
}
