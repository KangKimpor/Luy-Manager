"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="pointer-events-none absolute inset-0 animate-pulse rounded-[inherit] border-2 border-brand" aria-hidden="true" /> : null;
}

export function AppLink({ children, className, prefetch = true, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={prefetch} className={cn("relative", className)}>{children}<Pending /></Link>;
}
