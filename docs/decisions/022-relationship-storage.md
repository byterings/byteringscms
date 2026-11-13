# ADR-022: Relationship storage

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.9.

## Decision

Relations are stored in a `record_links` table (tenant_id, field_id, source_record_id, target_record_id, position). The record JSONB also holds the target ID(s) for simple reads. Targets are validated to be live records of the same tenant and target entity.

## Consequences

- One mechanism supports all cardinalities and reverse lookups.
- Expansion depth is limited to avoid unbounded queries.
