# ADR-025: Public API access

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.12.

## Decision

Anonymous reads are allowed only for entities with `publicRead=true`. If the entity defines a publish field, only records whose value equals the published value are returned. Only fields marked `isPublic` are serialized. Responses are rate limited and sent with short `Cache-Control`.

## Consequences

- Public access is opt-in per entity and per field.
