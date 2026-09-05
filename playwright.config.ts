import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4175);
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? port + 1);
const baseURL = `http://127.0.0.1:${port}`;
const apiURL = `http://127.0.0.1:${apiPort}`;
const node = `"${process.execPath}"`;

export default defineConfig({
  testDir: './e2e',
  use: { baseURL },
  webServer: [
    {
      command: `${node} ./node_modules/tsx/dist/cli.mjs server/index.ts`,
      url: `${apiURL}/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(apiPort),
        CORS_ORIGINS: baseURL,
      },
    },
    {
      command: `${node} ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
      url: baseURL,
      reuseExistingServer: false,
      env: { TOWNSCAPE_API_PORT: String(apiPort) },
    },
  ],
});
