# ADR-018: Role model

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.4.

## Decision

V1 ships built-in roles per membership: `owner`, `admin`, `editor`, `viewer`, mapped to a fixed permission matrix in code. API keys carry scopes (`records:read`, `records:write`, `metadata:read`, `metadata:write`, `media:read`, `media:write`). Custom roles are deferred.

## Consequences

- All checks go through one authorization service so custom roles can be added later without touching callers.
