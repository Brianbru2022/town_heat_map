# Townscape Guides release candidate procedure

This procedure is for an engineering release candidate. It does not approve a production launch,
change publication decisions, or replace the operator smoke checks below.

## Version and artefact convention

`package.json` holds the SemVer base version and pins the required pnpm release. Create candidate
tags only from a reviewed, clean commit using `v<version>-rc.<n>` (for example `v0.1.0-rc.1`).
Do not create the final `v<version>` tag until the candidate, perimeter smoke and any required
commercial approvals are complete.

Build images with the same candidate identifier so their OCI
`org.opencontainers.image.version` label and deployment record can be matched to the Git commit:

```powershell
$env:APP_VERSION = 'v0.1.0-rc.1'
docker compose build
```

Record the candidate tag, exact commit SHA, image digest and deployment time in the deployment
system. The browser payload does not expose internal paths, source data or deployment secrets.

## Clean, reproducible candidate

Start from a clean checkout of the reviewed candidate commit. The repository is intentionally
pnpm-only: use Corepack and the committed `pnpm-lock.yaml`; do not run npm, Yarn or Bun installs.

```powershell
git status --short
corepack enable
pnpm install --frozen-lockfile
pnpm verify:release
docker compose config
```

`pnpm verify:release` runs TypeScript, ESLint, maintained-code formatting, unit/API tests,
runtime schema validation, data validation, public delivery verification, public narrative audit,
public DTO/exposure contracts, deployment/security regression tests, production dependency audit,
production build and Playwright. On a new machine, install the Playwright browser first:

```powershell
pnpm exec playwright install chromium
```

The CI workflow repeats these gates on pull requests, `main`, `release/**`, and manual runs with a
frozen dependency install. It requires no production secret.

## Publication and formatting policy

The public release gate rejects a catalogue package unless it is explicitly publishable and its
public projection exactly matches the records that pass fail-closed publication assessment. Schema
errors, validation errors, unknown publication states, unsupported narrative/claims and public DTO
contract leaks fail CI. Deliberately withheld, provisional or review-blocked records remain in the
retained source package but cannot make it into public delivery, so they do not fail a candidate.

`pnpm format:check` is the required maintained-code gate. `pnpm format:check:all` is an
informational audit for imported, research and generated artefacts; it is deliberately not a
release gate and must not trigger mass formatting of evidence files.

## Operator smoke checklist

After CI and before promotion, the operator must:

1. Build and start the production Compose stack through the intended HTTPS perimeter, never by
   publishing Fastify directly.
2. Verify HTTPS, CSP/security headers and same-origin routing through the actual CDN/reverse proxy.
3. Smoke `/api/projects`, a town package and a listed-building CSV through the public route.
4. Check desktop and mobile visitor journeys, including the keyboard-accessible non-map place list.
5. Request representative raw-data/configuration/source-map paths and confirm denial.
6. Confirm rate limiting and real client-IP handling through the actual trusted proxy chain.
7. Record image digest, candidate version and rollback target before promotion.

`docker compose config` is automated locally and in CI. A live Docker/TLS-perimeter smoke remains
operator work because this repository does not own a production daemon, certificate or CDN.
