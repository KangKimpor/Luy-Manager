import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "@/components/app-icon";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Capsule buttons with 44px minimum touch targets and crisp press feedback.
  "tap-feedback rounded-pill inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-semibold transition-[background-color,transform,filter,opacity] duration-200 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-action hover:bg-brand-strong",
        secondary: "bg-fill text-brand hover:bg-surface-container",
        outline: "border border-border-subtle bg-surface text-ink hover:bg-fill",
        ghost: "text-ink-muted hover:bg-fill hover:text-ink",
        danger: "bg-outflow-soft text-outflow hover:brightness-95",
      },
      size: {
        sm: "min-h-11 px-4 text-sm",
        md: "min-h-11 px-5",
        lg: "min-h-[52px] px-6 text-base",
        full: "min-h-[52px] w-full px-6 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ComponentPropsWithoutRef<"button">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, type = "button", loading = false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || props["aria-busy"]}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {loading ? <LoaderCircle size={18} className="animate-spin shrink-0" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };
