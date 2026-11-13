# Security checklist (developmentPlan §17)

Status at the end of Phase 9 (2026-11-13). Every item links to its evidence.

| Gate | Status | Evidence |
| ---- | ------ | -------- |
| Tenant identity is resolved from a trusted source | ✅ | `Authenticator` + `TenancyService` (session membership, API key tenant, public slug only for public data); ADR-017; `test/auth.test.ts` |
| Every tenant-owned query is scoped | ✅ | Explicit `tenantId` filters **and** PostgreSQL RLS with `FORCE ROW LEVEL SECURITY` on every tenant table; `test/rls.test.ts` proves isolation without application filters |
| Cross-tenant integration tests pass | ✅ | `tenant-isolation`, `records` (attack matrix), `metadata`, `relations`, `media`, `templates-public`, `plugins` suites; e2e step 12-13 |
| Authentication and authorization are server-enforced | ✅ | Global `AuthGuard`, permission matrix (ADR-018), CSRF for cookie sessions, scoped API keys |
| Field-level permissions in serialization and writes | ✅ | `readMinRole`/`writeMinRole`; filters/sort/fields/expand limited to readable fields; `FIELD_FORBIDDEN` on writes |
| Inputs are validated against metadata | ✅ | Shared Zod validators (`packages/contracts/src/fields.ts`), server re-validation, plugin output re-validated |
| Query/filter/sort inputs are constrained | ✅ | Parameterized SQL built from metadata only (`record-query.ts`); injection attempts covered by tests |
| Pagination and request size limits | ✅ | `pageSize ≤ 100`, JSON body limit (`MAX_JSON_BODY`), upload limit (`MEDIA_MAX_BYTES`), rate limits (global + auth) |
| File uploads are validated | ✅ | Allow-listed types, content sniffing (no SVG), size limit, tenant-prefixed generated keys, `sandbox` CSP on downloads |
| Secrets are not committed or logged | ✅ | `.gitignore` for env files; log redaction; only hashes stored for sessions and API keys; Argon2id passwords |
| Audit events cover sensitive operations | ✅ | Auth, members, API keys, metadata, records, media, templates, plugins, config; values never stored (ADR-024) |
| Database migrations are reviewed | ✅ | SQL migrations in `apps/api/prisma/migrations`, generated with `db:new-migration` and committed with RLS policies |
| Backup/restore process is documented | ✅ | `backup-restore.md`; automated restore drill |
| API documentation matches implementation | ✅ | OpenAPI generated from contracts; contract test fails on undocumented or missing routes |
| Logs do not leak credentials or private data | ✅ | No bodies, query strings or credential headers are logged |

## Dependency audit

`pnpm audit --prod` on 2026-11-13: **no known vulnerabilities** after
overriding vulnerable transitive versions of `postcss` (via Next.js) and
`deepmerge-ts` (via Prisma) in `pnpm-workspace.yaml`. Re-run on every
dependency update; CI should treat new high/critical findings as failures.

## Hardening notes for operators

- Keep `COOKIE_SECURE=true` and serve only over HTTPS (Caddy does this).
- Set `SETUP_TOKEN` until first-run setup is complete.
- Expose only the reverse proxy; keep the API and PostgreSQL internal.
- The application database role must not be a superuser or have
  `BYPASSRLS`; use a separate privileged role only for backups/restores.
- Plugins run with the API's privileges: install only plugins you trust and
  have reviewed (they are never uploaded through the UI).

## Known limitations

- Rate limiting and the auth limiter keep state in memory, which suits a
  single API instance. Multiple instances need a shared store (Redis).
- No multi-factor authentication or SSO yet (non-goal for V1).
- Container images were not built in this development environment (no
  Docker available); verify `docker compose ... up --build` on a Docker host
  before the first production deployment.
