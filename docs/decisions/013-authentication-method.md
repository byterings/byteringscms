# ADR-013: Authentication method

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.1. Browsers (Admin Studio) and machine clients (websites, scripts, CLI) have different security needs.

## Decision

- **Browser clients:** opaque server-side sessions stored in PostgreSQL, sent as an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). State-changing cookie-authenticated requests require a CSRF token (double-submit header `x-csrf-token`).
- **Machine clients:** tenant-bound API keys sent as `Authorization: Bearer <key>`. Only a SHA-256 hash of the key is stored; the plain key is shown once. Keys carry scopes.
- Passwords are hashed with Argon2id.

## Consequences

- No JWTs to revoke; logout and session revocation are immediate.
- CSRF protection is required for cookie flows; bearer flows are CSRF-free.
- CORS stays restrictive for credentialed requests.
