import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type RequestContext } from '../common/request-context';
import { type Tx } from '../database/tenant-db.service';

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  /** Names of changed fields - never their values (ADR-024). */
  changedKeys?: string[];
  metadata?: Prisma.InputJsonValue;
}

/**
 * Writes audit events inside the caller's transaction so the event commits
 * or rolls back together with the change it describes.
 */
@Injectable()
export class AuditService {
  async record(
    tx: Tx,
    ctx: RequestContext | null,
    entry: AuditEntry,
    tenantId: string | null = ctx?.tenantId ?? null,
  ): Promise<void> {
    const actor = ctx?.actor ?? { type: 'system' as const };
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: actor.type,
        actorId:
          actor.type === 'user' ? actor.userId : actor.type === 'apiKey' ? actor.apiKeyId : null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        changedKeys: entry.changedKeys ?? [],
        metadata: entry.metadata,
        ipAddress: ctx?.ip ?? null,
      },
    });
  }
}
