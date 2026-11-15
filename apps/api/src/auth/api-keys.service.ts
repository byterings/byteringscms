import { Injectable } from '@nestjs/common';
import {
  type ApiKeyInfo,
  type ApiKeyScope,
  type CreateApiKeyRequest,
  type CreatedApiKey,
} from '@bytecontent/contracts';
import { type ApiKey } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { actorId, type TenantContext } from '../common/request-context';
import { TenantDb } from '../database/tenant-db.service';
import { generateApiKey, sha256 } from './crypto';

function toInfo(key: ApiKey): ApiKeyInfo {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes as ApiKeyScope[],
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  list(ctx: TenantContext): Promise<ApiKeyInfo[]> {
    return this.db.run(ctx.tenantId, async (tx) =>
      (
        await tx.apiKey.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { createdAt: 'desc' },
        })
      ).map(toInfo),
    );
  }

  async create(ctx: TenantContext, input: CreateApiKeyRequest): Promise<CreatedApiKey> {
    // A key can never carry more than its creator may do.
    const escalated = input.scopes.filter((scope) => !ctx.permissions.has(scope));
    if (escalated.length) {
      throw AppError.forbidden(`Cannot grant scopes you do not hold: ${escalated.join(', ')}`);
    }
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw AppError.validation([{ path: 'expiresAt', message: 'Must be in the future' }]);
    }
    const { key, prefix } = generateApiKey();
    const created = await this.db.run(ctx.tenantId, async (tx) => {
      const row = await tx.apiKey.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.name,
          prefix,
          keyHash: sha256(key),
          scopes: [...new Set(input.scopes)],
          createdById: actorId(ctx),
          expiresAt,
        },
      });
      await this.audit.record(tx, ctx, {
        action: 'apikey.created',
        targetType: 'api_key',
        targetId: row.id,
        metadata: { scopes: row.scopes },
      });
      return row;
    });
    return { apiKey: toInfo(created), key };
  }

  async revoke(ctx: TenantContext, id: string): Promise<void> {
    await this.db.run(ctx.tenantId, async (tx) => {
      const result = await tx.apiKey.updateMany({
        where: { id, tenantId: ctx.tenantId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) throw AppError.notFound('API key');
      await this.audit.record(tx, ctx, {
        action: 'apikey.revoked',
        targetType: 'api_key',
        targetId: id,
      });
    });
  }
}
