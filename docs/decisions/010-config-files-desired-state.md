# ADR-010: Config files are version-controlled desired state

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Developers want Git workflows; the running installation needs one authoritative state.

## Decision

Database metadata is runtime truth. Config files are a desired-state representation used for export, import and diff.

## Consequences

- `diff` is read-only; `push` shows a plan and needs confirmation for destructive changes.
- Secrets are never exported.
