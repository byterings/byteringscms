# ADR-003: PostgreSQL first

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

The metadata-driven design needs JSONB, transactions, constraints and mature tooling.

## Decision

PostgreSQL is the only supported database for V1.

## Consequences

- PostgreSQL-specific features (JSONB, RLS, partial indexes) may be used intentionally.
- No MySQL/SQLite promise in V1; no speculative adapters.
