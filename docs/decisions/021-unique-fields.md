# ADR-021: Enforcing unique field values

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.8. JSONB values cannot use per-field unique constraints without DDL.

## Decision

A `record_unique_values` table with a unique constraint on (tenant_id, field_id, value) is written in the same transaction as the record.

## Consequences

- Uniqueness is correct under concurrency without tenant-triggered DDL.
- Soft-deleted records release their values.
