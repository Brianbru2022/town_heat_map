import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './production-e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.PRODUCTION_BASE_URL ?? 'http://127.0.0.1:8080',
    viewport: { width: 1280, height: 820 },
  },
});
