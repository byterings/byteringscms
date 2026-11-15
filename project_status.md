# Project Status

## Current State

All roadmap phases 0-9 are implemented and tested. The platform runs
locally end to end: API, Admin Studio, CMS template, public API, SDK, CLI,
template upgrades, plugins, backups and restores.

Not done (requires infrastructure outside this repository):
- First SaaS pilot (hosting accounts, domain, monitoring service).
- Building and running the Docker images: Docker is not installed on the
  development machine. Dockerfiles and `docker-compose.prod.yml` are written
  and their build steps were verified natively (production `pnpm deploy`
  bundle booted against PostgreSQL; Next.js standalone tracing ran), but
  `docker compose up --build` has not been executed yet.

Branches: `main` (stable), `dev` (all work; not yet merged or pushed).

---

## Verification (2026-11-13)

| Check | Result |
| ----- | ------ |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` | pass |
| API tests (Vitest + Supertest, PostgreSQL 17) | 153 passed, incl. tenant-isolation suites and the restore drill |
| Unit tests: contracts 20, admin 5, SDK 5, CLI 5 | pass |
| Playwright end-to-end (`pnpm test:e2e`) | 10 passed |
| `pnpm audit --prod` | no known vulnerabilities |

---

## Completed

| Item | Summary | Key locations |
| ---- | ------- | ------------- |
| R-000 | Documentation baseline, ADR-001 … ADR-027, AGPL-3.0 | `docs/decisions/` |
| R-001 … R-007 | pnpm/Turborepo workspace, strict TS, NestJS API, Next.js Admin Studio, Prisma, CI, setup docs | root configs, `.github/workflows/ci.yml` |
| R-101 … R-107 | Tenants, users, memberships, sessions (Argon2id, CSRF), API keys, tenant context, roles, audit, first-run setup, RLS | `apps/api/src/{auth,tenancy,members,audit,database}` |
| R-201 … R-204 | Field type registry (11 types) with shared validators, entity/field metadata, versions | `packages/contracts/src/fields.ts`, `apps/api/src/metadata` |
| R-301 … R-306 | JSONB record engine: CRUD, validation, uniqueness, filters/sort/search/pagination, field permissions, optimistic concurrency, soft delete | `apps/api/src/records` |
| R-401 … R-404 | Admin Studio: login/setup, schema builder, metadata-driven forms and lists, members, API keys, audit log; §15 e2e | `apps/admin` |
| R-501 … R-503 | Relationships: `record_links`, target validation, expansion, relation picker | `relations.service.ts`, `relation-picker.tsx` |
| R-601 … R-606 | OpenAPI 3.1 + docs UI + tenant spec, contract tests, SDK, CLI, config export/diff/apply, rate/size limits | `packages/{sdk,cli}`, `apps/api/src/{openapi,config-sync}` |
| R-701 … R-705 | Media (local/S3 drivers, content sniffing), media library, public API, template engine, CMS template | `apps/api/src/{media,public-api,templates}`, `templates/cms` |
| R-801 … R-802 | Template upgrade plans/apply/history, trusted plugins with capabilities, `cms-publishing` sample | `template-upgrade.service.ts`, `apps/api/src/plugins`, `plugins/` |
| R-901 … R-904 | Dockerfiles + prod compose + Caddy, JSON logs with request ids, quotas/usage, maintenance job, backup/restore + drill, runbooks, security checklist | `apps/*/Dockerfile`, `docker-compose.prod.yml`, `scripts/`, `docs/operations/` |

Database migrations (in order): `identity_tenancy`, `metadata_engine`,
`record_engine`, `relationships`, `media_and_templates`,
`upgrades_and_plugins`. Each enables RLS on its tenant-owned tables.

---

## Decisions made during implementation

- Mature majors pinned: TypeScript 5.9, NestJS 11, Next.js 15.5, Prisma 6,
  Vitest 3, ESLint 9 (newer majors exist; upgrade deliberately).
- Tenant isolation is enforced twice: explicit `tenantId` filters and
  PostgreSQL RLS (`FORCE ROW LEVEL SECURITY`, non-superuser app role).
  `TenantDb.system()` bypasses RLS only in vetted installation-wide paths.
- Field keys/types and entity keys are immutable (ADR-020 addendum).
- The Admin Studio reaches the API through a runtime proxy route
  (`API_URL` read at runtime, not baked into the build).
- Prisma blocks AI agents from `migrate reset`/`migrate dev`; migrations are
  generated with `pnpm --filter @bytecontent/api db:new-migration <name>`
  (`prisma migrate diff` + shadow database) and tests never wipe databases.
- Backups/restores must use a role that bypasses RLS; restores keep owners.
- `tar` is implemented in `scripts/lib/tar.mjs` (no host `tar` dependency).
- Turborepo strict env mode: env vars used by tests/builds are declared in
  `turbo.json` (`passThroughEnv`, `env`).

---

## Known limitations

- Rate limiting state is in memory (single API instance).
- No MFA/SSO, billing, search engine or GraphQL (V1 non-goals).
- SVG uploads are rejected (would need sanitizing).
- Database and role names keep the original `byterings` prefix
  (`byterings_dev`, role `byterings`) so existing installations keep working.

---

## In Progress
None

## Pending
- First SaaS pilot (Phase 9 stage 2/3 infrastructure).
- Run `docker compose -f docker-compose.prod.yml up --build` on a Docker host.
- Merge `dev` into `main` and push when approved.

## Blockers
None.

## Environment notes (development machine)
- Native PostgreSQL 17 via `scripts/local-postgres.ps1` (no Docker).
- PostgreSQL 17 client tools (pg_dump/pg_restore/psql) in
  `%LOCALAPPDATA%\byterings\pgclient`; set `PG_BIN` to run the restore drill.
- Node.js 26 locally; CI uses Node 24 LTS (`.nvmrc`).
