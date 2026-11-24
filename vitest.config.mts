import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: { environment: "node", env: { DATABASE_URL: "memory://", TZ: "America/Sao_Paulo", ANTHROPIC_API_KEY: "" }, include: ["tests/**/*.test.ts"], testTimeout: 30000, fileParallelism: false },
});
