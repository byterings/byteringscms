# ADR-009: Templates define applications

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

CMS, CRM, ecommerce etc. must not become hardcoded core modules.

## Decision

Applications are template packages built on public core contracts.

## Consequences

- Core never imports template code.
- CMS publishing logic stays outside generic record CRUD.
- Template versions and dependencies are explicit.
