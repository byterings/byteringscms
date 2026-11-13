# Monitoring and troubleshooting

## Health checks

| Endpoint                     | Meaning                                  | Use for                |
| ---------------------------- | ---------------------------------------- | ---------------------- |
| `GET /api/v1/health`         | The process serves HTTP                  | Liveness probes        |
| `GET /api/v1/health/ready`   | The database is reachable (503 if not)   | Readiness, load balancers, uptime monitors |

Both container images define Docker `HEALTHCHECK`s.

## Logs

The API writes one JSON object per line to stdout (`LOG_FORMAT=json`):

```json
{"level":30,"time":1794589661477,"req":{"id":"7f0c…","method":"GET","path":"/api/v1/entities/article/records"},
 "tenantId":"…","actor":"user","res":{"statusCode":200},"responseTime":16,"msg":"request completed"}
```

- Every response carries `x-request-id`; clients may send their own
  (8-128 characters of `[A-Za-z0-9._-]`).
- Server errors (5xx) return `error.requestId` so users can quote it; the
  matching log line contains the stack trace.
- Never logged: query strings, request bodies, `Authorization`, cookies,
  CSRF and setup tokens. Audit events record field names, not values.
- Health checks are not logged.

Ship stdout to your log system (Docker logging driver, Loki, CloudWatch, …).

## Usage and quotas

`GET /api/v1/admin/usage` (permission `audit:read`) returns records, entities,
media files/bytes, members, API keys and configured limits for the tenant.
Set `TENANT_MAX_RECORDS` / `TENANT_MAX_MEDIA_BYTES` to cap tenants; exceeding
a limit returns `403 QUOTA_EXCEEDED`.

## Common problems

| Symptom                                   | Likely cause / fix                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| API exits with "Invalid environment …"    | A variable is missing or malformed; the message names it                  |
| Sign-in succeeds but session is lost      | `COOKIE_SECURE=true` over plain http; use HTTPS or set it to false locally |
| Everyone shares one rate limit            | `TRUST_PROXY=true` missing behind the proxy                               |
| `/health/ready` returns 503               | Database down or wrong `DATABASE_URL`                                     |
| Tenant data invisible after manual SQL    | Row-level security: set `app.tenant_id` or use a `BYPASSRLS` role         |
| `PLUGIN_TIMEOUT` errors                   | A plugin hook is slow; check its logs or raise `PLUGIN_HOOK_TIMEOUT_MS`   |
