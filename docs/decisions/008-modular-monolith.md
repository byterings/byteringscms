# ADR-008: Modular monolith

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Small team, need for transactional metadata operations, low operating cost.

## Decision

One deployable backend with explicit modules and dependency boundaries.

## Consequences

- Module boundaries enforced by code structure and tests.
- No message broker or service mesh until justified.
