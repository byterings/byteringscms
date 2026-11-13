# Upgrades

## Platform upgrades

1. **Read the release notes** and the ADRs that changed.
2. **Back up** (see `backup-restore.md`).
3. Update the code and rebuild:

   ```bash
   git pull
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   ```

   The API container runs `prisma migrate deploy` on start
   (`RUN_MIGRATIONS=true`): pending migrations are applied in order, each in
   its own transaction, and recorded in `_prisma_migrations`.
4. Check `GET /api/v1/health/ready` and the logs.

Native installs: `git pull && pnpm install --frozen-lockfile && pnpm build &&
pnpm db:deploy`, then restart the API and Admin Studio.

**Rollback:** migrations are forward-only. If an upgrade fails, restore the
backup taken in step 2 into a new database and deploy the previous version.

## Template upgrades

Template upgrades never run automatically. In the Admin Studio open
**Templates & plugins → Review upgrade**, or use the API:

```bash
GET  /api/v1/admin/templates/cms/upgrade-plan        # read-only preview
POST /api/v1/admin/templates/cms/upgrade  {"acceptBreaking": true}
GET  /api/v1/admin/templates/cms/upgrades            # history incl. failures
```

Guarantees (ADR-011, ADR-026):

- Tenant-created entities, fields and all records are never modified.
- Definitions the tenant customized are kept and listed as *Kept (customized)*.
- Definitions removed from the template are kept (with data) as *Deprecated*.
- Type changes and key collisions are conflicts that block the upgrade.
- Breaking changes (new required fields, new uniqueness) need explicit
  acceptance.
- The upgrade is one transaction; a failure changes nothing and is recorded
  in the history with its error.
