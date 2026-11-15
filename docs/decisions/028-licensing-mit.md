# ADR-028: Licensing: MIT (supersedes ADR-016)

- **Status:** Accepted
- **Date:** 2026-11-16
- **Supersedes:** [ADR-016](016-licensing-agpl.md)

## Context

The product is now named **ByteContent** (by ByteRings) and will be installed
from npm (`npx create-bytecontent`) and extended through a plugin
marketplace with free and paid plugins. AGPL-3.0 discourages adoption by
companies and makes closed-source (paid) third-party plugins legally
unclear. ByteRings is the only copyright holder, so the license can still be
changed without contributor agreements.

## Decision

The core, Admin Studio, SDK, CLI, templates and first-party plugins are
licensed under the **MIT License**, copyright ByteRings.

## Consequences

- Anyone may use, modify, embed and host ByteContent, including commercially.
- Plugin authors can publish free (any license) or paid closed-source plugins.
- ByteRings earns from paid plugins, templates, support and a future hosted
  Cloud offering rather than from license restrictions.
- Hosted forks are allowed; the brand ("ByteContent", "ByteRings", logos) is
  not covered by the license and stays with ByteRings.
- Changing the license again becomes harder once outside contributions are
  accepted; a contributor agreement should be decided before then.
