# Production deployment

The supplied Compose file is a production-oriented single-instance baseline. `web` is the only host-published service and defaults to `127.0.0.1:8080`; Fastify, optional tiles and optional geocoding have no host ports. Nginx is the same-origin gateway to Fastify over the private `api` network.

Put an HTTPS reverse proxy or CDN in front of `web` and make that the only internet-facing entry point. Set `WEB_BIND_ADDRESS=0.0.0.0` only when that perimeter is in place. Confirm every public hostname is HTTPS before relying on the HSTS header. Do not publish port 3001 or attach untrusted workloads to the private Compose network. The public proxy must remove client-supplied forwarded headers or establish a verified real-client address before forwarding to Nginx.

Fastify trusts forwarded client addresses only when `TRUST_PROXY_CIDRS` names the proxy range. Compose defaults to `uniquelocal` because its API is private; deployments with a different proxy must set the exact proxy CIDR(s). Leave it empty for direct local operation. `CORS_ORIGINS` is empty by default because browser traffic is same-origin; add only exact, HTTPS browser origins that genuinely need cross-origin access.

The API rate limiter is in-memory and is suitable for this single-instance pilot. For horizontally scaled API instances, use an edge/CDN limit and a shared Fastify rate-limit store before treating its limits as global. Retain application limits as a backstop. The HES proxy has a stricter per-client limit, a ten-second upper-bound request timeout, and serves a stale cached image when a suitable one is available.

Images build from the committed pnpm lockfile. The browser image contains only Vite `dist`; the non-root API image contains production dependencies, runtime code, curated project inputs and listed-building CSV exports. It does not receive review, import, curation, scripts, source-control or environment files. Provide `DATABASE_URL` only through deployment secrets if an operator-managed PostGIS store is required; the public static repository is the default and needs no database credential.

OpenStreetMap raster tiles are a zero-configuration local-development fallback. Review the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) before using public tiles. Production map styles, sprites and glyphs should be delivered same-origin (or added to the CSP only after a specific security and licensing review). Optional tile and Photon services are private Compose profiles; provision lawful data before enabling either.

Before release, run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm audit --prod`, and `docker compose config`. Smoke the public application through the TLS proxy rather than the Fastify port.
