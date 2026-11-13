# Backup and restore

A backup contains the **database** (`pg_dump` custom format) and the **media
files** of the local storage driver, plus a manifest with SHA-256 checksums.
With `STORAGE_DRIVER=s3`, back up the bucket with your provider's tools
(versioning or replication) and run the database backup below.

> Backups and restores must use a PostgreSQL role that bypasses row-level
> security (the `postgres` superuser, or a dedicated role with `BYPASSRLS`
> and `pg_read_all_data`). The application role only sees one tenant at a
> time, so a dump taken with it would be empty.

## Create a backup

```bash
# Docker Compose (run on the host; requires Node.js 22+ and PostgreSQL 17 client tools)
node scripts/backup.mjs \
  --database-url "postgresql://postgres:$POSTGRES_PASSWORD@<db-host>:5432/byterings" \
  --storage /path/to/media \
  --out /srv/backups
```

`PG_BIN` can point to the directory with `pg_dump` if it is not on `PATH`.
Output: `/srv/backups/<timestamp>/{database.dump, storage.tar, manifest.json}`.

Recommended policy (adjust to your needs):

| What       | Frequency | Retention   |
| ---------- | --------- | ----------- |
| Database   | daily     | 14 daily, 8 weekly |
| Media      | daily     | same as database   |
| Off-site   | weekly    | encrypted copy (e.g. restic, borg, S3 with SSE) |

Backups contain personal data and password hashes: store them encrypted and
restrict access to administrators.

## Restore

Restores go into a **new, empty database** (never over a live one):

```bash
createdb -U postgres -O byterings byterings_restored   # the app role must exist
node scripts/restore.mjs \
  --from /srv/backups/<timestamp> \
  --database-url "postgresql://postgres:$POSTGRES_PASSWORD@<db-host>:5432/byterings_restored" \
  --storage /path/to/new/media-dir \
  --confirm
```

The script verifies checksums, refuses non-empty targets, restores in a
single transaction and keeps the original object owners (so row-level
security keeps protecting tenant data). Then point `DATABASE_URL` and the
media volume at the restored copies and restart the API.

## Restore drill

`apps/api/test/restore-drill.test.ts` performs a full drill automatically:
it populates an installation, backs it up, restores it into an empty
database, signs in and verifies records and media byte-for-byte. It runs in
CI (PostgreSQL 17 client tools are installed there) and locally whenever
`pg_dump` is available (`PG_BIN`). Run a manual drill against real backups at
least quarterly.
