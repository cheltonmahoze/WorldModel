import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit and contract tests for the platform's pure logic: formatting, RBAC,
 * commercial plan limits, validation schemas and the integration catalogue.
 * Anything that needs a database is exercised end-to-end by `npm run test:e2e`
 * against a running server instead of being mocked here.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: ["verbose"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://nexus:nexus@127.0.0.1:55432/nexus_os?schema=public",
      SESSION_SECRET: "test-secret-that-is-long-enough-for-validation",
    },
  },
});
