import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { loggerOptions } from './common/logging';
import { ClientThrottlerGuard } from './common/rate-limit';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env';
import { ConfigSyncModule } from './config-sync/config-sync.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MediaModule } from './media/media.module';
import { MembersModule } from './members/members.module';
import { MetadataModule } from './metadata/metadata.module';
import { OpenApiModule } from './openapi/openapi.module';
import { PluginsModule } from './plugins/plugins.module';
import { PublicApiModule } from './public-api/public.module';
import { RecordsModule } from './records/records.module';
import { TemplatesModule } from './templates/templates.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { UsageModule } from './usage/usage.module';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(loggerOptions(env)),
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE },
        ]),
        DatabaseModule,
        AuditModule,
        UsageModule,
        TenancyModule,
        AuthModule,
        MembersModule,
        MetadataModule,
        MediaModule,
        PluginsModule,
        RecordsModule,
        ConfigSyncModule,
        TemplatesModule,
        PublicApiModule,
        OpenApiModule,
        HealthModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ClientThrottlerGuard }],
    };
  }
}
