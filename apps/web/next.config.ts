import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // npm workspaces hoist Next.js and shared dependencies to the repository root.
  // Tracing only apps/web produces an incomplete OpenNext server bundle.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
};

export default nextConfig;
