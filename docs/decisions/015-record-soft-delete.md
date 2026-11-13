# ADR-015: Soft delete for records

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.5. Accidental deletion of content must be recoverable, and audit needs history.

## Decision

Records use a nullable `deleted_at` column. Deleted records are excluded from all normal reads and from uniqueness checks. Admins can restore a record; a purge command permanently removes records deleted longer than a retention window ago.

## Consequences

- Every record query filters `deleted_at IS NULL`.
- Unique values are released on delete and re-checked on restore.
