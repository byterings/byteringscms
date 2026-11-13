# ADR-019: Optimistic concurrency for records

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.6. Two editors may overwrite each other.

## Decision

Records have an integer `version` incremented on each update. Update requests may include `version`; a mismatch returns HTTP 409 `RECORD_VERSION_CONFLICT`.

## Consequences

- Admin Studio always sends version; API clients may opt in.
