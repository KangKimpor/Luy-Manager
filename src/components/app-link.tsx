"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Pending() {
  const { pending } = useLinkStatus();
  return <span className="link-pending pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-brand" data-pending={pending || undefined} aria-hidden="true" />;
}

export function AppLink({ children, className, prefetch = true, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={prefetch} className={cn("relative", className)}>{children}<Pending /></Link>;
}
