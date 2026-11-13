import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClientThrottlerGuard } from './common/rate-limit';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env';
import { ConfigSyncModule } from './config-sync/config-sync.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MembersModule } from './members/members.module';
import { MetadataModule } from './metadata/metadata.module';
import { OpenApiModule } from './openapi/openapi.module';
import { RecordsModule } from './records/records.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE },
        ]),
        DatabaseModule,
        AuditModule,
        TenancyModule,
        AuthModule,
        MembersModule,
        MetadataModule,
        RecordsModule,
        ConfigSyncModule,
        OpenApiModule,
        HealthModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ClientThrottlerGuard }],
    };
  }
}
