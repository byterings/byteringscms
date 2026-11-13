import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';

/**
 * Single Prisma client for the process. Tenant-owned data must be accessed
 * through `TenantDb` (tenant-scoped transactions), not directly through this
 * client, so that row-level security context is always set.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_ENV) env: Env) {
    super({ datasourceUrl: env.DATABASE_URL });
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
