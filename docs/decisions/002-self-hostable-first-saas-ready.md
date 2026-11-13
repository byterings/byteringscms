# ADR-002: Self-hostable first, SaaS-ready

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Budget does not justify expensive infrastructure, but SaaS isolation guarantees cannot be retrofitted cheaply.

## Decision

Prioritize local and self-hosted installation while enforcing SaaS-quality tenant isolation from the start.

## Consequences

- Docker Compose is a first-class development and deployment path.
- Free cloud tiers are for demos only.
- No infrastructure that current usage does not need.
