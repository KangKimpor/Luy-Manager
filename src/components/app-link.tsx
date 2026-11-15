"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Pending() {
  const { pending } = useLinkStatus();
  return <span className="link-pending pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-brand" data-pending={pending || undefined} aria-hidden="true" />;
}

const NAV_TRANSITION = ["nav"];

/**
 * Whether a link leaves the current screen.
 *
 * The month stepper, the view tabs and the filters all link to the same path with
 * different parameters. Those change part of a screen the reader is already on,
 * so fading the whole page for them would be motion without meaning.
 */
function leavesScreen(href: ComponentProps<typeof Link>["href"], pathname: string): boolean {
  const target = typeof href === "string" ? href : href.pathname ?? "";
  if (!target.startsWith("/")) return false;
  return target.split(/[?#]/)[0] !== pathname;
}

export function AppLink({ children, className, prefetch, transitionTypes, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const types = transitionTypes ?? (leavesScreen(props.href, pathname) ? NAV_TRANSITION : undefined);
  return <Link {...props} prefetch={prefetch} transitionTypes={types} className={cn("app-link relative", className)}>{children}<Pending /></Link>;
}
