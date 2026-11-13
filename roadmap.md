# Roadmap

Planned work, ordered by phase (see `developmentPlan.md` §14). The status
here is the plan; `project_status.md` is the record of what is actually
implemented. Never assume a roadmap item exists in code without checking.

## Format

Each item: **ID**, **Title**, **Description**, **Priority**, **Status**
(`pending`, `in-progress`, `done`, `blocked`).

IDs: `R-000` documentation; `R-0xx` Phase 0; `R-1xx` Phase 1; … `R-9xx` Phase 9.

---

## Documentation

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-000 | Documentation baseline | Hygiene files, AGPL license, ADRs 001–027, real context/roadmap/status, aligned README/plan/agent guide | High | done |

## Phase 0 — Repository and engineering foundation

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-001 | Workspace and tooling | pnpm workspace, Turborepo, strict shared TypeScript config, ESLint, Prettier | High | done |
| R-002 | API application | NestJS app, Zod environment validation, `/api/v1/health` and `/api/v1/ready`, test setup | High | done |
| R-003 | Database and migrations | Prisma, PostgreSQL connection, migration workflow, test database handling | High | done |
| R-004 | Admin application | Next.js Admin Studio skeleton with Tailwind, typed API client stub | High | done |
| R-005 | Local services | `docker-compose.yml` for Postgres; scripts for the native local Postgres | High | done |
| R-006 | CI pipeline | GitHub Actions: install, lint, typecheck, test with a Postgres service | High | done |
| R-007 | Local setup documentation | Prerequisites and commands in README | High | done |

## Phase 1 — Identity, tenancy and authorization

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-101 | Tenancy data model | Installation, tenants, users, memberships, sessions, API keys tables | High | done |
| R-102 | Authentication | Argon2id passwords, DB sessions, httpOnly cookie, CSRF, login/logout/me (ADR-013) | High | done |
| R-103 | Tenant context | Request-scoped tenant resolution (ADR-017), tenant-scoped data access, PostgreSQL RLS defense | High | done |
| R-104 | Roles and permissions | Built-in roles and permission matrix, authorization service and guards (ADR-018) | High | done |
| R-105 | Audit foundation | Audit event service and storage (ADR-024) | High | done |
| R-106 | Bootstrap | Installation setup command creating the first tenant and owner; tenant switch | High | done |
| R-107 | Tenant isolation suite | Two-tenant integration tests for every tenant-owned resource | High | done |

## Phase 2 — Metadata engine

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-201 | Field type registry | text, integer, decimal, boolean, date, datetime, select, multiselect, relation, media — each with config schema, validation, serialization, filter ops | High | done |
| R-202 | Entity and field metadata | Tables, ownership/status, stable IDs and keys | High | done |
| R-203 | Metadata admin API | CRUD for entities and fields with validation and compatibility checks | High | done |
| R-204 | Metadata versioning | `metadata_versions` history (ADR-020) | Medium | done |

## Phase 3 — Generic record engine

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-301 | Record CRUD | JSONB records, create/read/update/delete via `/api/v1/entities/:entityKey/records` | High | done |
| R-302 | Record validation | Metadata-driven validation, defaults, required, unique values (ADR-021) | High | done |
| R-303 | Querying | Pagination with hard maximum, sorting, filtering by type-safe operators, field selection | High | done |
| R-304 | Field permissions | Field read/write rules in serialization and writes | High | done |
| R-305 | Concurrency and soft delete | `version` conflicts (ADR-019), soft delete + restore (ADR-015) | High | done |
| R-306 | Record audit and isolation | Audit events and cross-tenant tests for records | High | done |

## Phase 4 — Admin Studio vertical slice

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-401 | Studio shell | Login, session, tenant switcher, navigation, error/loading states | High | done |
| R-402 | Entity and field builder | Create/edit entities and fields from the field type registry | High | done |
| R-403 | Record manager | Metadata-driven list and create/edit forms | High | done |
| R-404 | Vertical slice e2e | Playwright test of developmentPlan §15 | High | done |

## Phase 5 — Relationships

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-501 | Relationship engine | `record_links`, cardinalities, same-tenant target validation (ADR-022) | High | done |
| R-502 | Expansion | `expand` parameter with depth and size limits | High | done |
| R-503 | Relationship UI | Relation pickers and display in the Studio | Medium | done |

## Phase 6 — API hardening and developer experience

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-601 | OpenAPI | Published spec and docs UI for all routes | High | done |
| R-602 | TypeScript SDK | Typed client package | High | done |
| R-603 | API key management | Create/revoke scoped keys via API and Studio | High | done |
| R-604 | Limits | Rate limiting and request size limits | High | done |
| R-605 | Config export/import/diff | Metadata as JSON files; read-only diff; plan-then-apply push | High | done |
| R-606 | CLI | `entities:list`, `export`, `import`, `schema:diff`, `schema:push`, `template:install` | Medium | done |

## Phase 7 — Media and CMS template

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-701 | Media storage | Storage driver interface, local + S3 drivers, upload validation (ADR-023) | High | pending |
| R-702 | Media library UI | Upload, list, pick media in the Studio | Medium | pending |
| R-703 | Public API | Anonymous read of public entities/fields/published records (ADR-025) | High | pending |
| R-704 | Template engine | Manifest format, install on a tenant, ownership tracking | High | pending |
| R-705 | CMS template | Article, Page, Category, Tag, Author; slugs, SEO, draft/published | High | pending |

## Phase 8 — Template/plugin lifecycle and upgrades

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-801 | Template upgrades | Plan/diff, conflict detection for overrides (ADR-026), upgrade history | High | pending |
| R-802 | Plugin contract | Manifest, capabilities, trusted lifecycle hooks, sample plugin | Medium | pending |

## Phase 9 — Production readiness

| ID | Title | Description | Priority | Status |
| -- | ----- | ----------- | -------- | ------ |
| R-901 | Production containers | Dockerfiles, production compose, secure env template | High | pending |
| R-902 | Observability and quotas | Structured logs, error handling, basic tenant quotas | High | pending |
| R-903 | Backup and restore | Scripts and a demonstrated restore | High | pending |
| R-904 | Runbooks and security review | Install/upgrade/backup runbooks, security checklist, dependency audit | High | pending |
