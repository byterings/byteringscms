import { Controller, Get, Query } from '@nestjs/common';
import { auditQuerySchema, pageMeta, type AuditQuery } from '@bytecontent/contracts';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { TenantDb } from '../database/tenant-db.service';

@Controller('admin/audit-events')
export class AuditController {
  constructor(private readonly db: TenantDb) {}

  @Get()
  @RequirePermissions('audit:read')
  async list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery,
  ) {
    const { tenantId } = requireTenant(ctx);
    const where = {
      tenantId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
    };
    const [rows, total] = await this.db.run(tenantId, (tx) =>
      Promise.all([
        tx.auditEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.auditEvent.count({ where }),
      ]),
    );
    return {
      data: rows.map((row) => ({
        id: row.id,
        actorType: row.actorType,
        actorId: row.actorId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        changedKeys: row.changedKeys,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: pageMeta(query, total),
    };
  }
}
