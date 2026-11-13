# ADR-005: NestJS and TypeScript backend

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Need modular structure, dependency injection, validation and OpenAPI with one language across the stack.

## Decision

Use NestJS with strict TypeScript for the API.

## Consequences

- Controllers stay thin; services own behaviour.
- Dynamic tenant metadata is not expressed through decorators.
