# Installation (self-hosted)

Two supported paths: **Docker Compose** (recommended for servers) and a
**native** install (Node.js + PostgreSQL) for environments without Docker.

## 1. Docker Compose

Requirements: Docker Engine 24+ with Compose v2, a DNS name pointing to the
server, ports 80/443 open.

```bash
git clone <repository> byteringscms && cd byteringscms
cp .env.production.example .env.production
# Edit .env.production: DOMAIN, POSTGRES_PASSWORD, APP_DB_PASSWORD,
# SETUP_TOKEN (generate with: openssl rand -base64 32)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

What starts:

| Service    | Purpose                                              | Exposed |
| ---------- | ---------------------------------------------------- | ------- |
| `caddy`    | HTTPS termination, automatic certificates            | 80, 443 |
| `admin`    | Admin Studio + same-origin `/api` proxy              | no      |
| `api`      | REST API; applies migrations on start                | no      |
| `postgres` | PostgreSQL 17 (app role without superuser/BYPASSRLS) | no      |

### First-run setup

Open `https://<DOMAIN>/setup`. Because `SETUP_TOKEN` is set, the setup
request needs the token; complete setup with the API:

```bash
curl -X POST https://<DOMAIN>/api/v1/setup \
  -H 'content-type: application/json' -H "x-setup-token: $SETUP_TOKEN" \
  -d '{"tenantName":"Acme","tenantSlug":"acme","name":"Ada","email":"ada@acme.com","password":"<12+ chars>"}'
```

or from the server, without HTTP:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec \
  -e SETUP_PASSWORD='<12+ chars>' api node dist/cli/setup.js \
  --tenant-name Acme --tenant-slug acme --name Ada --email ada@acme.com
```

Then sign in at `https://<DOMAIN>/login`.

### Scheduled maintenance

Run daily (cron, systemd timer):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm maintenance
```

It deletes expired sessions, prunes audit events older than
`AUDIT_RETENTION_DAYS` (365) and purges trash older than
`TRASH_RETENTION_DAYS` (30).

## 2. Native install

Requirements: Node.js 22+ (24 LTS recommended), pnpm 10, PostgreSQL 16+.

```bash
pnpm install
ADMIN_DATABASE_URL=postgresql://postgres:<pw>@localhost:5432/postgres \
APP_DB_PASSWORD=<strong password> pnpm db:setup-local   # role + databases
cp apps/api/.env.example apps/api/.env                 # edit DATABASE_URL etc.
pnpm build && pnpm db:deploy
NODE_ENV=production node apps/api/dist/main.js         # API on :4000
API_URL=http://localhost:4000 pnpm --filter @byteringscms/admin start  # :3000
```

Put a TLS reverse proxy (Caddy, nginx) in front of the Admin Studio and set
`TRUST_PROXY=true` on the API. Do not expose the API port publicly unless
you also route `/api` to it directly.

## Configuration reference

All API settings are validated at startup (`apps/api/src/config/env.ts`);
an invalid value stops the process with a clear message. Key settings:

| Variable                         | Default         | Notes                                     |
| -------------------------------- | --------------- | ----------------------------------------- |
| `DATABASE_URL`                   | (required)      | Application role (not superuser)          |
| `TENANCY_MODE`                   | `single`        | `multi` for many tenants                  |
| `COOKIE_SECURE`                  | true in prod    | Requires HTTPS                            |
| `TRUST_PROXY`                    | `false`         | `true` behind a reverse proxy             |
| `SETUP_TOKEN`                    | unset           | Protects first-run setup                  |
| `STORAGE_DRIVER`                 | `local`         | `s3` with `S3_*` settings                 |
| `MEDIA_MAX_BYTES`                | 10 MB           | Upload size limit                         |
| `RATE_LIMIT_PER_MINUTE`          | 600             | Per IP / API key                          |
| `AUTH_RATE_LIMIT_PER_MINUTE`     | 10              | Login and setup per IP                    |
| `TENANT_MAX_RECORDS`             | 0 (unlimited)   | Quota                                     |
| `TENANT_MAX_MEDIA_BYTES`         | 0 (unlimited)   | Quota                                     |
| `LOG_LEVEL` / `LOG_FORMAT`       | `info` / `json` | `pretty` for local development            |
| `TEMPLATES_DIR` / `PLUGINS_DIR`  | repo folders    | Set in the container image                |
