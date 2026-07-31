"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // After load, so registration never competes with the first paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        // A failed registration costs offline support, not the app, so it is logged
        // rather than surfaced.
        console.warn("Service worker registration failed:", error);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
