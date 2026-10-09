import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        // surface-variant rather than border-subtle: at this elevation the hairline
        // only needs to separate the card from the page, not draw attention.
        "rounded-card bg-surface-raised shadow-card border border-surface-variant",
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
