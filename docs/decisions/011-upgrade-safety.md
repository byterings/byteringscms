# ADR-011: Upgrade safety is a core capability

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Tenant customizations and data must survive platform and template updates.

## Decision

Platform, template and plugin upgrades are versioned and migration-driven.

## Consequences

- Ownership of managed metadata is tracked.
- Upgrades produce plans and conflict reports.
- Backups before risky production upgrades.
