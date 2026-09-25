import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @repo/shared ships raw .ts, so Next must transpile it.
  transpilePackages: ["@repo/shared"],
};

export default nextConfig;
