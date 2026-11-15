# Project Context

System understanding for developers and agents. Describes the intended
architecture; check `project_status.md` for what is implemented.

## Overview

A multi-tenant, metadata-driven application platform. Tenants define
entities, fields, relationships and permissions as metadata; the platform
provides storage, validation, authorization, REST APIs and a generated
Admin Studio at runtime. The first application is a headless CMS template.
Self-hostable first, SaaS-ready (ADR-001, ADR-002). Licensed MIT (ADR-028).

## Architecture

- **Backend:** NestJS + TypeScript modular monolith (`apps/api`), REST
  `/api/v1`, OpenAPI contract.
- **Frontend:** Next.js Admin Studio (`apps/admin`), a client of the same
  API. Customer frontends are independent and use the API/SDK.
- **Database:** PostgreSQL. Relational tables for system data; JSONB
  `records.data` for metadata-managed values. Prisma for schema/migrations.
- **Shared contracts:** `packages/contracts` — Zod schemas and types used
  by API, Admin Studio and SDK.

## Repository layout (target)

```
apps/api            NestJS API
apps/admin          Next.js Admin Studio
packages/contracts  Shared Zod schemas, field-type definitions, API types
packages/sdk        TypeScript client SDK
packages/cli        Developer CLI
templates/cms       CMS application template
plugins/            Trusted local plugins
infrastructure/     Docker and deployment files
docs/decisions      ADRs
```

## Modules (inside `apps/api`)

| Module | Responsibility |
| ------ | -------------- |
| config | Environment validation |
| health | Liveness/readiness |
| database | Prisma client, tenant-scoped transactions (RLS session settings) |
| tenancy | Tenant resolution and request context (ADR-017) |
| auth | Passwords, sessions, CSRF, API keys (ADR-013) |
| permissions | Built-in roles, permission checks (ADR-018) |
| audit | Audit events (ADR-024) |
| metadata | Entities, fields, field-type registry, versions (ADR-020) |
| records | Generic record CRUD, validation, querying (ADR-015/019/021) |
| relations | Record links and expansion (ADR-022) |
| media | Storage drivers and uploads (ADR-023) |
| public-api | Anonymous read of public content (ADR-025) |
| templates | Template install/upgrade (ADR-026) |
| plugins | Trusted plugin hooks |

## Request flow

1. Resolve installation and tenant context (session, API key, or public slug).
2. Authenticate caller.
3. Verify membership / API-key scope.
4. Load entity metadata in tenant scope.
5. Authorize the entity/record action.
6. Validate fields against metadata and field permissions.
7. Persist inside a tenant-scoped transaction (RLS as second layer).
8. Serialize only permitted fields.
9. Emit audit event.

## Tenancy

- `TENANCY_MODE=single|multi`. Single resolves every request to the
  installation default tenant; multi uses the session's active tenant.
- Client-supplied tenant IDs are never trusted.
- Every tenant-owned table carries `tenant_id`; queries are scoped in code
  and by PostgreSQL row-level security policies.

## Integrations

- Object storage: local filesystem or S3-compatible (ADR-023).
- No Redis, queue, or search engine yet (ADR-012).

## Constraints

- PostgreSQL only (ADR-003). No tenant-triggered DDL (ADR-004).
- No GraphQL, microservices, marketplace or billing in V1.
- Tenant isolation tests are release blockers.
