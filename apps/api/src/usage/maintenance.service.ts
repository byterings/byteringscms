import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { TenantDb } from '../database/tenant-db.service';
import { STORAGE_DRIVER, type StorageDriver } from '../media/storage';
import { RelationsService } from '../records/relations.service';
import { type TenantContext } from '../common/request-context';

export interface MaintenanceResult {
  expiredSessions: number;
  auditEvents: number;
  purgedRecords: number;
  purgedMedia: number;
}

const BATCH = 500;

/**
 * Installation-wide housekeeping, run on a schedule (e.g. daily cron):
 * expired sessions, audit retention (ADR-024), trash purge (ADR-015).
 * Uses the RLS bypass deliberately: it works across all tenants.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger('MaintenanceService');

  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly db: TenantDb,
    private readonly relations: RelationsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async run(now = new Date()): Promise<MaintenanceResult> {
    const day = 24 * 3_600_000;
    const auditCutoff = new Date(now.getTime() - this.env.AUDIT_RETENTION_DAYS * day);
    const trashCutoff = new Date(now.getTime() - this.env.TRASH_RETENTION_DAYS * day);

    const result = await this.db.system(async (tx) => {
      const sessions = await tx.session.deleteMany({ where: { expiresAt: { lte: now } } });
      const audit = await tx.auditEvent.deleteMany({ where: { createdAt: { lt: auditCutoff } } });
      return { expiredSessions: sessions.count, auditEvents: audit.count };
    });

    let purgedRecords = 0;
    for (;;) {
      const batch = await this.db.system(async (tx) => {
        const rows = await tx.record.findMany({
          where: { deletedAt: { lt: trashCutoff } },
          select: { id: true, tenantId: true },
          take: BATCH,
        });
        for (const row of rows) {
          await this.relations.detachTarget(
            tx,
            { tenantId: row.tenantId } as TenantContext,
            row.id,
          );
          await tx.record.delete({ where: { id: row.id } });
        }
        return rows.length;
      });
      purgedRecords += batch;
      if (batch < BATCH) break;
    }

    const media = await this.db.system((tx) =>
      tx.media.findMany({
        where: { deletedAt: { lt: trashCutoff } },
        select: { id: true, storageKey: true },
      }),
    );
    for (const item of media) {
      await this.storage.delete(item.storageKey).catch((error: unknown) => {
        this.logger.warn(`Could not delete ${item.storageKey}: ${(error as Error).message}`);
      });
      await this.db.system((tx) => tx.media.delete({ where: { id: item.id } }));
    }

    const summary = { ...result, purgedRecords, purgedMedia: media.length };
    this.logger.log(`Maintenance finished: ${JSON.stringify(summary)}`);
    return summary;
  }
}
