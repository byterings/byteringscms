# ADR-012: SaaS infrastructure is staged

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

No users yet; infrastructure spend must follow real demand.

## Decision

Grow infrastructure in stages: local, demo, first paying tenants, growing SaaS (developmentPlan §13.3).

## Consequences

- Redis, queues, search and replicas are added only when a measured need exists.
