import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    staleTimes: { dynamic: 30, static: 60 },
  },
};

export default nextConfig;
