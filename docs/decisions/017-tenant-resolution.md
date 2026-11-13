# ADR-017: Tenant resolution

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.2. Tenant identity must come from a trusted server-side source.

## Decision

- `TENANCY_MODE=single`: every request resolves to the installation default tenant.
- `TENANCY_MODE=multi`: the active tenant comes from the authenticated session (validated against membership) or from the API key bound tenant.
- Public (anonymous) requests resolve the tenant from the tenant slug in the route (`/api/v1/public/:tenantSlug/...`) and can only see explicitly public data.
- Hostname-to-tenant mapping is deferred.

## Consequences

- Raw tenant IDs in headers, body or query are never accepted as authorization.
