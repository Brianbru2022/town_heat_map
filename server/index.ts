import { buildApp } from './app';

const app = await buildApp();
await app.listen({
  port: Number(process.env.PORT ?? 3001),
  // Keep ad-hoc and development API listeners local. The production container
  // opts into all interfaces only inside its private Compose network.
  host: process.env.API_BIND_ADDRESS ?? '127.0.0.1',
});
