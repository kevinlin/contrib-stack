import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { E2E_ENV } from "./e2e/seed";

const monorepoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  globalSetup: "./e2e/seed.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "pnpm --filter widget build && pnpm --filter web exec next dev --port 3000",
    cwd: monorepoRoot,
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      ...E2E_ENV,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
