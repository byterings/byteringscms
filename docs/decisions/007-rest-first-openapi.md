# ADR-007: REST first, OpenAPI as contract

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Clients include websites, mobile apps and scripts in many languages.

## Decision

Versioned REST (`/api/v1`) with a published OpenAPI document. GraphQL is deferred.

## Consequences

- Standard response, error, pagination and filter conventions.
- SDK types generated from the contract.
