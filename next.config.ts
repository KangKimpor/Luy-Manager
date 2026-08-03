import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A package-lock in the parent directory otherwise makes Turbopack watch a
  // much broader workspace. Pinning the actual app root cuts file watching and
  // invalidation work in development and removes the production-build warning.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
