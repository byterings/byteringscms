# Project Status

## Current State

Phases 0-6 complete: foundation, identity/tenancy/authorization, metadata
engine, record engine, Admin Studio vertical slice (Playwright e2e of
developmentPlan §15 passes), relationships, and API hardening/developer
experience (OpenAPI, SDK, CLI, config as code, rate limits).
Next: Phase 7 — media and the CMS template.

Branches: `main` (stable), `dev` (active work).

---

## Completed

### R-000 — Documentation baseline
- Status: done

Files Changed:
- `.gitignore`, `.editorconfig`, `.gitattributes`, `LICENSE`, `CONTRIBUTING.md`
- `docs/decisions/` (ADR-001 … ADR-027, template, index)
- `context.md`, `roadmap.md`, `project_status.md`
- `README.md`, `developmentPlan.md`, `AGENTS.md`, `CLAUDE.md`

What Changed:
- Repository hygiene files and the AGPL-3.0 license.
- Baseline decisions extracted into ADRs; open decisions from
  developmentPlan §20 recorded as ADR-013 … ADR-027.

Why:
- Unambiguous starting point before Phase 0.

### R-001 … R-007 — Phase 0 foundation
- Status: done

Files Changed:
- Root: `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`,
  `docker-compose.yml`, `.github/workflows/ci.yml`
- `packages/contracts` — shared Zod schemas (error envelope, health)
- `apps/api` — NestJS app: env validation (`src/config`), error envelope
  filter, Zod pipe, Prisma service, `/api/v1/health` and
  `/api/v1/health/ready`, `scripts/setup-local-db.mjs`
- `apps/admin` — Next.js 15 + Tailwind 4 skeleton, same-origin `/api`
  proxy, typed `ApiClient`
- `infrastructure/docker/postgres/init/01-app-role.sh`,
  `scripts/local-postgres.ps1`

What Changed:
- pnpm + Turborepo workspace with strict TypeScript, ESLint, Prettier.
- API refuses to start with invalid configuration; all errors use
  `{ error: { code, message, details? } }`.
- Application DB role is non-superuser without BYPASSRLS (needed for RLS).
- CI runs format check, lint, typecheck, build and tests against Postgres.

Tests:
- `packages/contracts`: 3 unit tests.
- `apps/api`: env parsing (4), health/readiness/error envelope (6) — all pass.
- `apps/admin`: API client (4) — all pass.

Known limitations:
- Docker Compose file not executed locally (Docker not installed).
- Prisma blocks AI agents from running `migrate reset`; the test setup uses
  non-destructive `migrate deploy` and tests isolate data with unique
  tenants/users instead of wiping the database.

Decisions:
- Pinned mature majors: TypeScript 5.9, NestJS 11, Next.js 15.5, Prisma 6,
  Vitest 3, ESLint 9 (newer majors exist but are not yet adopted).
- API build uses `tsc` (Nest CLI) for correct output layout; tests use
  Vitest + SWC for decorator metadata.

### R-101 … R-107 — Phase 1 identity, tenancy and authorization
- Status: done

Files Changed:
- `apps/api/prisma/schema.prisma`, migration `*_identity_tenancy` (tables
  + RLS policies via `app_rls_allows()`)
- `apps/api/src/database/tenant-db.service.ts` — `run(tenantId)` /
  `system()` transactions that set the RLS context
- `apps/api/src/auth/*` — Argon2id passwords, DB sessions, CSRF, API keys,
  global `AuthGuard`, `Authenticator`
- `apps/api/src/tenancy/*` — tenant resolution, current tenant, platform
  tenant provisioning, first-run setup (API + `cli:setup`)
- `apps/api/src/members/*`, `apps/api/src/audit/*`
- `packages/contracts/src/{permissions,auth,members,api-keys,tenants,audit,pagination}.ts`

Endpoints (all under `/api/v1`):
- `GET /setup/status`, `POST /setup`
- `POST /auth/login`, `GET /auth/session`, `POST /auth/logout`,
  `POST /auth/switch-tenant`, `POST /auth/password`
- `GET|PATCH /tenant`
- `GET|POST /admin/members`, `PATCH|DELETE /admin/members/:id`
- `GET|POST /admin/api-keys`, `DELETE /admin/api-keys/:id`
- `GET /admin/audit-events`
- `GET|POST /platform/tenants`, `PATCH /platform/tenants/:id/status`

Tests: 50 API tests pass (RLS 7, auth 11, setup 7, isolation 15,
health 6, env 4); contracts 9.

Decisions:
- Tenant isolation is enforced twice: explicit `tenantId` filters and
  PostgreSQL RLS (`FORCE ROW LEVEL SECURITY`, non-superuser role).
- `TenantDb.system()` (RLS bypass) is used only for login lookups, setup,
  platform provisioning and a user's own membership list.
- API keys act with a role derived from their scopes for field-level checks.
- Migrations are generated with `pnpm --filter @byteringscms/api
  db:new-migration <name>` (`prisma migrate diff` + shadow DB).

---

## In Progress
None

---

## Pending
- Phases 2–9: see `roadmap.md`

---

## Blockers
None.

## Environment notes
- Local development on this machine uses a native PostgreSQL 17
  (`scripts/local-postgres.ps1`, user-level install, no Docker).
- Node.js 26 locally; CI uses Node 24 LTS (`.nvmrc`).
