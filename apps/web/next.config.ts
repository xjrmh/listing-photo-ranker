import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadEnvConfig(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));

const nextConfig: NextConfig = {
  transpilePackages: ["@listing-photo-ranker/core"]
};

export default nextConfig;
