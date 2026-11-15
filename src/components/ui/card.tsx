import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        // Flat, shadowless cards separated from the page by surface contrast;
        // card-edge stays transparent in light mode and adds a 0.5px edge in dark.
        "rounded-card bg-surface-raised shadow-card border-card-edge min-w-0 border-[0.5px]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("px-5 pt-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentPropsWithoutRef<"h3">) {
  return (
    <h3
      className={cn("text-ink text-base font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("px-5 pt-2 pb-5", className)} {...props} />;
}
