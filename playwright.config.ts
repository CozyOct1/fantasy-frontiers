import { defineConfig, devices } from "@playwright/test";

const e2eDatabasePath = `data/playwright-${Date.now()}-${process.pid}.sqlite`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @fantasy-frontiers/game exec vite --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      env: { VITE_API_BASE_URL: "http://127.0.0.1:3102" },
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @fantasy-frontiers/server dev",
      url: "http://127.0.0.1:3102/health",
      reuseExistingServer: false,
      env: { PORT: "3102", DATABASE_PATH: e2eDatabasePath },
      timeout: 30_000,
    },
  ],
});
