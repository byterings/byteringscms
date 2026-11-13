# ADR-020: Metadata activation and history

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.7.

## Decision

Metadata changes activate immediately. Every change writes a `metadata_versions` row (entity snapshot, actor, timestamp). Incompatible changes (for example changing a field type) are rejected while records hold values for that field.

## Consequences

- No draft/publish layer for schema in V1; history allows diagnosis and recovery.
