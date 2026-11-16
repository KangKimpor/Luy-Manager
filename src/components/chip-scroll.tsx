"use client";

import { type ComponentPropsWithoutRef, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Horizontal chip strip that scrolls with a thumb swipe on touch screens and
 * with either the mouse wheel or click-and-drag on desktop pointers.
 */
export function ChipScroll({
  className,
  onPointerDown,
  onClickCapture,
  children,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function handleWheel(event: WheelEvent) {
      if (event.ctrlKey) return;
      const maxScrollLeft = el!.scrollWidth - el!.clientWidth;
      if (maxScrollLeft <= 0) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const factor = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? el!.clientWidth : 1;
      const delta = event.deltaY * factor;
      const canScrollRight = delta > 0 && el!.scrollLeft < maxScrollLeft;
      const canScrollLeft = delta < 0 && el!.scrollLeft > 0;
      if (!canScrollRight && !canScrollLeft) return;

      event.preventDefault();
      el!.scrollLeft += delta;
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    onPointerDown?.(event);
    if (event.defaultPrevented) return;
    if (event.pointerType === "touch") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("input, select, textarea")) return;

    const el = ref.current;
    if (!el) return;

    suppressClickRef.current = false;
    const startX = event.clientX;
    const startScrollLeft = el.scrollLeft;
    let dragged = false;

    function handlePointerMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - startX;
      if (!dragged && Math.abs(dx) > 5) {
        dragged = true;
        suppressClickRef.current = true;
        el!.setAttribute("data-dragging", "true");
      }
      if (dragged) {
        moveEvent.preventDefault();
        el!.scrollLeft = startScrollLeft - dx;
      }
    }

    function finishPointer() {
      el?.removeAttribute("data-dragging");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointer);
      window.removeEventListener("pointercancel", finishPointer);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointer);
    window.addEventListener("pointercancel", finishPointer);
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClickCapture?.(event);
  }

  return (
    <div
      ref={ref}
      className={cn("chip-scroll", className)}
      onPointerDown={handlePointerDown}
      onClickCapture={handleClickCapture}
      {...props}
    >
      {children}
    </div>
  );
}
