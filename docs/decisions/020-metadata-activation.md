# ADR-020: Metadata activation and history

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.7.

## Decision

Metadata changes activate immediately. Every change writes a `metadata_versions` row (entity snapshot, actor, timestamp). Incompatible changes (for example changing a field type) are rejected while records hold values for that field.

## Consequences

- No draft/publish layer for schema in V1; history allows diagnosis and recovery.

## Addendum (implementation)

- Entity keys, field keys and field types are immutable after creation;
  stored JSONB values stay keyed and typed consistently. To change a type,
  delete the field and recreate it.
- Changing a relation field's target entity or cardinality is only allowed
  while no record holds a value for it.
- Making a field required or narrowing select options is allowed; existing
  records are validated on their next write.
