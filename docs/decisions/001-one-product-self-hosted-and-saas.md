# ADR-001: One product for self-hosted and SaaS

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

The platform must run both on customer infrastructure and as a hosted service. Maintaining two products would double the work.

## Decision

Use the same codebase and runtime for self-hosted and SaaS deployments. Deployment configuration (`TENANCY_MODE`) controls single-tenant or multi-tenant behaviour.

## Consequences

- Tenant context is a core concern everywhere.
- SaaS-specific billing/provisioning is layered around the same runtime.
- No separate SaaS codebase.
