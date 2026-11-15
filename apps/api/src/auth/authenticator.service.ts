import { Inject, Injectable } from '@nestjs/common';
import { type ApiKeyScope, effectiveRoleForScopes } from '@bytecontent/contracts';
import { type Request } from 'express';
import { AppError } from '../common/app-error';
import { anonymousContext, type RequestContext } from '../common/request-context';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { TenantDb } from '../database/tenant-db.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { API_KEY_PREFIX, sha256 } from './crypto';

const TOUCH_INTERVAL_MS = 60_000;

/** Builds the RequestContext from a session cookie or a bearer API key. */
@Injectable()
export class Authenticator {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly tenancy: TenancyService,
  ) {}

  async authenticate(req: Request): Promise<RequestContext> {
    const ip = req.ip ?? null;
    const authorization = req.header('authorization');
    if (authorization) {
      const match = /^Bearer\s+(\S+)$/i.exec(authorization);
      if (!match?.[1]) throw AppError.unauthenticated('Malformed Authorization header');
      return this.fromApiKey(match[1], ip);
    }
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[this.env.SESSION_COOKIE_NAME];
    if (typeof token === 'string' && token.length > 0 && token.length < 200) {
      const ctx = await this.fromSession(token, ip);
      if (ctx) return ctx;
    }
    return anonymousContext(ip);
  }

  private async fromApiKey(key: string, ip: string | null): Promise<RequestContext> {
    const invalid = () => AppError.unauthenticated('Invalid API key');
    if (!key.startsWith(`${API_KEY_PREFIX}_`) || key.length > 200) throw invalid();
    const now = new Date();
    // System access: the key itself identifies the tenant; nothing else is known yet.
    const apiKey = await this.db.system(async (tx) => {
      const found = await tx.apiKey.findUnique({
        where: { keyHash: sha256(key) },
        include: { tenant: { select: { status: true } } },
      });
      if (
        found &&
        (!found.lastUsedAt || now.getTime() - found.lastUsedAt.getTime() > TOUCH_INTERVAL_MS)
      ) {
        await tx.apiKey.update({ where: { id: found.id }, data: { lastUsedAt: now } });
      }
      return found;
    });
    if (
      !apiKey ||
      apiKey.revokedAt ||
      (apiKey.expiresAt && apiKey.expiresAt <= now) ||
      apiKey.tenant.status !== 'active'
    ) {
      throw invalid();
    }
    const scopes = apiKey.scopes as ApiKeyScope[];
    return {
      actor: { type: 'apiKey', apiKeyId: apiKey.id, name: apiKey.name, scopes },
      tenantId: apiKey.tenantId,
      role: effectiveRoleForScopes(scopes),
      permissions: new Set(scopes),
      ip,
    };
  }

  private async fromSession(token: string, ip: string | null): Promise<RequestContext | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    const now = new Date();
    if (!session || session.expiresAt <= now || session.user.status !== 'active') return null;

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }

    const candidate = await this.tenancy.candidateTenant(session.activeTenantId);
    const access = candidate
      ? await this.tenancy.verifyMembership(candidate, session.userId)
      : null;

    return {
      actor: {
        type: 'user',
        userId: session.user.id,
        email: session.user.email,
        name: session.user.name,
        isPlatformAdmin: session.user.isPlatformAdmin,
        sessionId: session.id,
        csrfToken: session.csrfToken,
      },
      tenantId: access?.tenantId ?? null,
      role: access?.role ?? null,
      permissions: this.tenancy.permissionsFor(access?.role ?? null),
      ip,
    };
  }
}
