import { Injectable } from '@nestjs/common';
import { type SetupRequest } from '@bytecontent/contracts';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { AppError } from '../common/app-error';
import { TenantDb } from '../database/tenant-db.service';
import { TenancyService } from './tenancy.service';

/**
 * First-run installation setup: creates the default tenant and its owner
 * (who is also the platform administrator). Runs exactly once; the
 * installation row's primary key makes concurrent attempts fail safely.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly db: TenantDb,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly tenancy: TenancyService,
  ) {}

  isInitialized(): Promise<boolean> {
    return this.tenancy.isInitialized();
  }

  async setup(input: SetupRequest): Promise<{ userId: string; tenantId: string }> {
    if (await this.isInitialized()) throw this.alreadyInitialized();
    const passwordHash = await this.passwords.hash(input.password);
    try {
      // System write: nothing exists yet, there is no tenant context to use.
      return await this.db.system(async (tx) => {
        await tx.installation.create({ data: { id: 1 } });
        const tenant = await tx.tenant.create({
          data: { name: input.tenantName, slug: input.tenantSlug },
        });
        const existing = await tx.user.findUnique({ where: { email: input.email } });
        const user =
          existing ??
          (await tx.user.create({
            data: { email: input.email, name: input.name, passwordHash, isPlatformAdmin: true },
          }));
        if (existing) {
          await tx.user.update({ where: { id: existing.id }, data: { isPlatformAdmin: true } });
        }
        await tx.membership.create({
          data: { tenantId: tenant.id, userId: user.id, role: 'owner' },
        });
        await tx.installation.update({ where: { id: 1 }, data: { defaultTenantId: tenant.id } });
        await this.audit.record(
          tx,
          null,
          { action: 'installation.setup', targetType: 'tenant', targetId: tenant.id },
          tenant.id,
        );
        return { userId: user.id, tenantId: tenant.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.alreadyInitialized();
      }
      throw error;
    }
  }

  private alreadyInitialized(): AppError {
    return AppError.conflict('ALREADY_INITIALIZED', 'This installation is already set up');
  }
}
