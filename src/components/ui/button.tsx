import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "@/components/app-icon";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // min-h-11 keeps every button at or above the 44px touch target that mobile
  // accessibility guidance asks for.
  "tap-feedback inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-[background-color,transform,box-shadow] duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-action hover:bg-brand-strong hover:shadow-fab",
        secondary: "bg-brand-soft text-brand hover:bg-brand-soft/70",
        outline: "border border-border-subtle bg-surface text-ink hover:bg-surface-muted",
        ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink",
        danger: "bg-outflow text-on-action hover:brightness-95",
      },
      size: {
        sm: "min-h-11 px-3 text-sm",
        md: "min-h-11 px-4",
        lg: "min-h-13 px-6 text-base",
        full: "min-h-13 w-full px-6 text-base",
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
