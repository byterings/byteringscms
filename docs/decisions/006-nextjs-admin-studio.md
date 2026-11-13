# ADR-006: Next.js Admin Studio, independently headless

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

A good default admin UX is needed without locking customers into a platform frontend.

## Decision

Use Next.js for the Admin Studio. Customer frontends use the API/SDK independently.

## Consequences

- Admin Studio consumes API contracts only.
- Forms and tables render from metadata.
- No authorization implemented only in the UI.
