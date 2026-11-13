# ADR-024: Audit events and retention

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.11.

## Decision

Audit events store actor, tenant, action, target type/ID and changed field keys (not values). Default retention is 365 days (`AUDIT_RETENTION_DAYS`), enforced by a prune command.

## Consequences

- No private record data leaks into audit logs.
