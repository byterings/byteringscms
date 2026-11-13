# Project Status

## Current State

Documentation baseline complete. No application code exists yet.
Next: Phase 0 (R-001 … R-007).

Branches: `main` (stable), `dev` (active work).

---

## Completed

### R-000 — Documentation baseline
- Status: done

Files Changed:
- `.gitignore`, `.editorconfig`, `.gitattributes`, `LICENSE`, `CONTRIBUTING.md`
- `docs/decisions/` (ADR-001 … ADR-027, template, index)
- `context.md`, `roadmap.md`, `project_status.md`
- `README.md`, `developmentPlan.md`, `AGENTS.md`, `CLAUDE.md`

What Changed:
- Added repository hygiene files and the AGPL-3.0 license.
- Extracted baseline decisions into ADRs and recorded the open decisions
  from developmentPlan §20 as ADR-013 … ADR-027.
- Replaced template placeholders in the working documents.

Why:
- Prepare an unambiguous starting point before Phase 0.

---

## In Progress
None

---

## Pending
- Phase 0: R-001 … R-007
- Phases 1–9: see `roadmap.md`

---

## Blockers
None.

## Environment notes
- Local development uses a native PostgreSQL 17 (user-level install, no
  Docker). Docker Compose files are provided but not yet verified on this
  machine because Docker is not installed.
