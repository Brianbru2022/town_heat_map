# Historic Town Explorer

A self-hosted, source-backed public explorer for historical town projects. The repository contains curated public packages for Alloa, Alva, Culross, Kincardine-on-Forth, Tillicoultry, Quarrier's Village, Biggar and Killin, together with the repeatable import and review tooling used to create them.

## Quick start

`pnpm install --frozen-lockfile`, optionally copy `.env.example` to `.env`, then run `pnpm dev`. The map uses OpenStreetMap raster tiles by default for local development; configure a permitted self-hosted map style for production traffic. Run `pnpm api` in another terminal for the read-only API. `pnpm validate-data`, `pnpm lint`, `pnpm test`, and `pnpm build` validate the workspace.

See [RELEASE.md](RELEASE.md) for the reproducible release-candidate procedure and CI gates. pnpm and `pnpm-lock.yaml` are the only supported install path.

Historic-map overlays use locally built MBTiles rather than a MapTiler browser key. The read-only API serves approved packages from `data/runtime/tiles`; the optional Docker `tiles` profile remains available for larger future map collections. Use `npm run check-local-historic-maps`, review the four control points in the intake manifest, run `npm run prepare-local-historic-map -- <manifest>`, and finally run `npm run publish-local-historic-maps`.

Use `docker compose up --build` for the loopback-bound web/API stack. The public HTTPS reverse proxy or CDN is an operator responsibility; it must be the only internet-facing entry. Add the private `tiles` and `geocoder` profiles only after supplying lawful OSM extracts and indexes.

See [ARCHITECTURE.md](ARCHITECTURE.md), [ADDING_A_TOWN.md](ADDING_A_TOWN.md), and [DEPLOYMENT.md](DEPLOYMENT.md).

## Reference data

The versioned `data/reference/scotland-hes-library.zip` archive is the local HES source collection used by the Scottish import commands. Extract it to `data/reference/scotland-hes/` after cloning. It remains source data rather than published app payload: `data/projects/` holds the curated town records and `data/runtime/` remains local deployment output.

See [the HES library register](data/reference/SCOTLAND_HES_LIBRARY.md) for provenance, permitted use and the expected local paths.
