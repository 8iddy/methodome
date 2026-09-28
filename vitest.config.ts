import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@methodome/domain": root + "packages/domain/src/index.ts",
      "@methodome/study-spec": root + "packages/study-spec/src/index.ts",
      "@methodome/method-registry": root + "packages/method-registry/src/index.ts",
      "@methodome/analysis-contracts": root + "packages/analysis-contracts/src/index.ts",
      "@methodome/model-adapter": root + "packages/model-adapter/src/index.ts",
      "@methodome/policy-engine": root + "packages/policy-engine/src/index.ts",
      "@methodome/provenance": root + "packages/provenance/src/index.ts",
      "@methodome/data-pipeline": root + "packages/data-pipeline/src/index.ts",
      "@methodome/benchmark": root + "packages/benchmark/src/index.ts",
      "@methodome/analysis-plan": root + "packages/analysis-plan/src/index.ts",
      "@methodome/schema-harmonisation": root + "packages/schema-harmonisation/src/index.ts"
    }
  }
});
