# ADR-004: Relational system tables + JSONB records

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Tenants define their own entities at runtime. Physical DDL per entity is risky; pure EAV is slow and complex.

## Decision

System/platform data lives in relational tables. Metadata-managed record values live in a JSONB `data` column of a generic `records` table.

## Consequences

- Metadata drives validation and serialization.
- JSONB indexes are added selectively from real query patterns.
- No tenant-triggered DDL.
