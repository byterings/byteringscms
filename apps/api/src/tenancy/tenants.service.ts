import { Injectable } from '@nestjs/common';
import { type CreateTenantRequest, type Tenant } from '@byteringscms/contracts';
import { type Tenant as TenantRow, type TenantStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { AppError } from '../common/app-error';
import { type RequestContext, type TenantContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import { TenantDb } from '../database/tenant-db.service';
import { TenancyService } from './tenancy.service';

export function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly tenancy: TenancyService,
  ) {}

  async current(ctx: TenantContext): Promise<Tenant> {
    return toTenant(await this.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }));
  }

  async rename(ctx: TenantContext, name: string): Promise<Tenant> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const row = await tx.tenant.update({ where: { id: ctx.tenantId }, data: { name } });
      await this.audit.record(tx, ctx, {
        action: 'tenant.updated',
        targetType: 'tenant',
        targetId: ctx.tenantId,
        changedKeys: ['name'],
      });
      return toTenant(row);
    });
  }

  // ----- platform administration (multi-tenant installations) -----

  async listAll(): Promise<Tenant[]> {
    return (await this.prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } })).map(toTenant);
  }

  async create(ctx: RequestContext, input: CreateTenantRequest): Promise<Tenant> {
    this.assertMulti();
    const passwordHash = input.owner.password
      ? await this.passwords.hash(input.owner.password)
      : null;
    // System write: a platform administrator provisions a tenant and its owner.
    return this.db.system(async (tx) => {
      if (await tx.tenant.findUnique({ where: { slug: input.slug } })) {
        throw AppError.conflict('SLUG_TAKEN', 'A tenant with this slug already exists');
      }
      const tenant = await tx.tenant.create({ data: { name: input.name, slug: input.slug } });
      let owner = await tx.user.findUnique({ where: { email: input.owner.email } });
      if (!owner) {
        if (!passwordHash || !input.owner.name) {
          throw AppError.validation(
            [{ path: 'owner.password', message: 'name and password are required for a new user' }],
            'Owner does not exist yet',
          );
        }
        owner = await tx.user.create({
          data: { email: input.owner.email, name: input.owner.name, passwordHash },
        });
      }
      await tx.membership.create({
        data: { tenantId: tenant.id, userId: owner.id, role: 'owner' },
      });
      await this.audit.record(
        tx,
        ctx,
        { action: 'tenant.created', targetType: 'tenant', targetId: tenant.id },
        tenant.id,
      );
      return toTenant(tenant);
    });
  }

  async setStatus(ctx: RequestContext, id: string, status: TenantStatus): Promise<Tenant> {
    this.assertMulti();
    return this.db.system(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { id } });
      if (!existing) throw AppError.notFound('Tenant');
      const row = await tx.tenant.update({ where: { id }, data: { status } });
      await this.audit.record(
        tx,
        ctx,
        {
          action: 'tenant.status_changed',
          targetType: 'tenant',
          targetId: id,
          metadata: { status },
        },
        id,
      );
      return toTenant(row);
    });
  }

  private assertMulti(): void {
    if (this.tenancy.mode !== 'multi') {
      throw AppError.conflict('TENANCY_SINGLE', 'This installation runs in single-tenant mode');
    }
  }
}
