# ADR-014: Multi-tenant user membership

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.3. Agencies and platform admins commonly work across organizations.

## Decision

A user can belong to many tenants through a `memberships` table (user, tenant, role). The active tenant is stored on the server-side session and is always re-checked against membership.

## Consequences

- Tenant switching is a session operation, not a client-supplied ID.
- Email uniqueness is global; roles are per tenant.
