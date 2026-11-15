import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // A package-lock in the parent directory otherwise makes Turbopack watch a
  // much broader workspace. Pinning the actual app root cuts file watching and
  // invalidation work in development and removes the production-build warning.
  turbopack: {
    root: process.cwd(),
  },
  // Every page here renders per request, so with the default of 0 seconds each tap
  // waited on a server round trip even for a page seen a moment ago. A server
  // action that calls revalidatePath or sets a cookie clears this cache, so an
  // edit made in the app shows up immediately. Only changes made elsewhere (the
  // Telegram bot) can lag, by at most this long.
  experimental: {
    staleTimes: { dynamic: 30, static: 30 },
  },
  headers() {
    return [
      {
        // Every icon is a CSS mask pointing at its own file, and files in public/
        // default to max-age=0. That made each navigation revalidate a dozen icons
        // one request at a time, and they painted late. The names are not hashed, so
        // this is a week rather than immutable, with a long stale window so a
        // changed icon is picked up in the background instead of blocking paint.
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
        ],
      },
      {
        source: "/icon.svg",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
