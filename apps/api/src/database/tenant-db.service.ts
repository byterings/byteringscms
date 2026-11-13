import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type Tx = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * Entry point for all access to tenant-owned tables.
 *
 * `run(tenantId, fn)` executes `fn` inside a transaction whose PostgreSQL
 * row-level security context is set to the tenant. Even if application code
 * forgets a `tenantId` filter, the database only returns that tenant's rows.
 *
 * `system(fn)` bypasses RLS and must only be used by vetted code paths that
 * legitimately work across tenants (authentication lookups, installation
 * setup, platform administration). Every call site should explain why.
 */
@Injectable()
export class TenantDb {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID_RE.test(tenantId)) {
      return Promise.reject(new Error('TenantDb.run requires a tenant UUID'));
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    }, TX_OPTIONS);
  }

  system<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx);
    }, TX_OPTIONS);
  }
}
