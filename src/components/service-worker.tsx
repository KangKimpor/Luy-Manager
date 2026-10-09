"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Registers the service worker.
 *
 * Only in production. In development the worker would sit in front of the dev
 * server's own asset pipeline and serve stale chunks after a hot reload, which
 * presents as bewildering bugs that disappear on a hard refresh.
 *
 * Renders nothing; it exists so the root layout can stay a server component.
 */
export function ServiceWorkerRegistration() {
  const router = useRouter();

  useEffect(() => {
    let hiddenAt: number | null = null;
    let refreshedAt = 0;
    const refresh = () => {
      // Overview screens can change while Telegram or another device is in use.
      // Entry and settings screens keep their draft, even after a long pause.
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      if (!["/", "/accounts", "/transactions", "/budgets", "/reports"].includes(window.location.pathname)) return;
      if (document.activeElement?.matches("input, textarea, select, [contenteditable='true']")) return;
      const now = Date.now();
      if (now - refreshedAt < 5000) return;
      refreshedAt = now;
      router.refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt >= 15000) refresh();
        hiddenAt = null;
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      // Safari's restored page can have an old server payload after sign-in or
      // a bot entry. Refresh merges new data while preserving scroll position.
      if (event.persisted) refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", refresh);
    };
  }, [router]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A worker left by a local production preview otherwise caches hot reload
      // chunks. Only this app's registration and caches are disposable.
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        await Promise.all(registrations.filter((registration) => {
          const worker = registration.active ?? registration.waiting ?? registration.installing;
          return worker?.scriptURL === new URL("/sw.js", window.location.origin).href;
        }).map((registration) => registration.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith("luy-")).map((key) => caches.delete(key)));
        }
      }).catch(() => undefined);
      return;
    }

    let registration: ServiceWorkerRegistration | undefined;
    let cancelled = false;
    let checkedAt = 0;
    const checkUpdate = () => {
      if (!registration || document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (now - checkedAt < 60000) return;
      checkedAt = now;
      void registration.update().catch(() => undefined);
    };

    // After load, so registration never competes with the first paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }).then((result) => {
        if (cancelled) return;
        registration = result;
        checkedAt = Date.now();
      }).catch((error) => {
        // A failed registration costs offline support, not the app, so it is logged
        // rather than surfaced.
        console.warn("Service worker registration failed:", error);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    document.addEventListener("visibilitychange", checkUpdate);
    window.addEventListener("online", checkUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", checkUpdate);
      window.removeEventListener("online", checkUpdate);
    };
  }, []);

  return null;
}
