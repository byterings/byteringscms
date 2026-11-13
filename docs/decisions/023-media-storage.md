# ADR-023: Media storage

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Open decision §20.10.

## Decision

A `StorageDriver` interface with a local filesystem driver (default) and an S3-compatible driver. Object keys are prefixed by tenant ID. Uploads are validated by size, allowed MIME type and file signature.

## Consequences

- Works offline for self-hosters; S3/R2/MinIO via configuration.
