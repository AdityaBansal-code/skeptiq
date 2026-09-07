import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @repo/shared ships raw .ts — Next must transpile it. See docs/decision-log.md D3.
  transpilePackages: ["@repo/shared"],
};

export default nextConfig;
