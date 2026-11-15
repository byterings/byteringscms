import { Inject, Injectable } from '@nestjs/common';
import { ROLE_PERMISSIONS, type Role } from '@bytecontent/contracts';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { TenantDb } from '../database/tenant-db.service';

export interface TenantAccess {
  tenantId: string;
  role: Role;
}

/**
 * Resolves which tenant a signed-in user is acting in (ADR-017) and verifies
 * membership on every request. Never trusts a client-supplied tenant id.
 */
@Injectable()
export class TenancyService {
  private defaultTenantId: string | null = null;

  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
  ) {}

  get mode(): Env['TENANCY_MODE'] {
    return this.env.TENANCY_MODE;
  }

  /** Installation default tenant (single-tenant mode). Cached once known. */
  async getDefaultTenantId(): Promise<string | null> {
    if (this.defaultTenantId) return this.defaultTenantId;
    const installation = await this.prisma.installation.findUnique({ where: { id: 1 } });
    this.defaultTenantId = installation?.defaultTenantId ?? null;
    return this.defaultTenantId;
  }

  async isInitialized(): Promise<boolean> {
    return (await this.prisma.installation.count({ where: { id: 1 } })) > 0;
  }

  /** Candidate tenant for a session before membership verification. */
  async candidateTenant(sessionActiveTenantId: string | null): Promise<string | null> {
    return this.mode === 'single' ? this.getDefaultTenantId() : sessionActiveTenantId;
  }

  /** Returns the user's role in the tenant, or null if not an active member. */
  async verifyMembership(tenantId: string, userId: string): Promise<TenantAccess | null> {
    const membership = await this.db.run(tenantId, (tx) =>
      tx.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        select: { role: true, tenant: { select: { status: true } } },
      }),
    );
    if (!membership || membership.tenant.status !== 'active') return null;
    return { tenantId, role: membership.role };
  }

  permissionsFor(role: Role | null): Set<(typeof ROLE_PERMISSIONS)[Role][number]> {
    return new Set(role ? ROLE_PERMISSIONS[role] : []);
  }
}
