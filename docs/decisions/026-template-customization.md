# ADR-026: Template customization and upgrades

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.13.

## Decision

Each entity/field definition has an `owner` (`tenant`, `template:<id>`, `plugin:<id>`) and a checksum of the managed definition. A tenant edit of a managed definition sets `overridden=true`. Upgrades update non-overridden managed definitions, never touch tenant-owned ones, and report overridden ones as conflicts.

## Consequences

- Upgrades are previewable and never silently overwrite customizations.
