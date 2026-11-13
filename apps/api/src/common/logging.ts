import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { type Params } from 'nestjs-pino';
import { type Env } from '../config/env';

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Structured JSON request logging (R-902). Credentials, cookies and CSRF or
 * setup tokens are redacted; query strings are not logged because they may
 * contain search terms or filter values.
 */
export function loggerOptions(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      transport:
        env.LOG_FORMAT === 'pretty'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-csrf-token"]',
          'req.headers["x-setup-token"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customProps: (req: IncomingMessage) => {
        const ctx = (
          req as IncomingMessage & { ctx?: { tenantId: string | null; actor: { type: string } } }
        ).ctx;
        return ctx ? { tenantId: ctx.tenantId, actor: ctx.actor.type } : {};
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => (req.url ?? '').startsWith('/api/v1/health'),
      },
    },
  };
}
