import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { type TenantContext } from '../common/request-context';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { TenantDb, type Tx } from '../database/tenant-db.service';

export interface TenantUsage {
  records: number;
  entities: number;
  media: { files: number; bytes: number };
  members: number;
  apiKeys: number;
  limits: { maxRecords: number | null; maxMediaBytes: number | null };
}

/** Basic tenant quotas and usage visibility (R-902). 0 means unlimited. */
@Injectable()
export class UsageService {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly db: TenantDb,
  ) {}

  usage(ctx: TenantContext): Promise<TenantUsage> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const tenantId = ctx.tenantId;
      const [records, entities, media, members, apiKeys] = await Promise.all([
        tx.record.count({ where: { tenantId, deletedAt: null } }),
        tx.entity.count({ where: { tenantId } }),
        tx.media.aggregate({
          where: { tenantId, deletedAt: null },
          _count: true,
          _sum: { size: true },
        }),
        tx.membership.count({ where: { tenantId } }),
        tx.apiKey.count({ where: { tenantId, revokedAt: null } }),
      ]);
      return {
        records,
        entities,
        media: { files: media._count, bytes: media._sum.size ?? 0 },
        members,
        apiKeys,
        limits: {
          maxRecords: this.env.TENANT_MAX_RECORDS || null,
          maxMediaBytes: this.env.TENANT_MAX_MEDIA_BYTES || null,
        },
      };
    });
  }

  async assertRecordQuota(tx: Tx, tenantId: string): Promise<void> {
    const max = this.env.TENANT_MAX_RECORDS;
    if (!max) return;
    const count = await tx.record.count({ where: { tenantId, deletedAt: null } });
    if (count >= max) {
      throw new AppError(
        'QUOTA_EXCEEDED',
        `This workspace has reached its limit of ${max} records`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async assertMediaQuota(tenantId: string, additionalBytes: number): Promise<void> {
    const max = this.env.TENANT_MAX_MEDIA_BYTES;
    if (!max) return;
    const used = await this.db.run(tenantId, (tx) =>
      tx.media.aggregate({ where: { tenantId, deletedAt: null }, _sum: { size: true } }),
    );
    if ((used._sum.size ?? 0) + additionalBytes > max) {
      throw new AppError(
        'QUOTA_EXCEEDED',
        'This workspace has reached its media storage limit',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
