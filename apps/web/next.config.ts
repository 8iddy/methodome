import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  // npm workspaces hoist Next.js and shared dependencies to the repository root.
  // OpenNext consumes the standalone build, while tracing must still see the
  // workspace root so the emitted server bundle includes hoisted dependencies.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url))
};

export default nextConfig;
