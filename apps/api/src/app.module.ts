import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MembersModule } from './members/members.module';
import { MetadataModule } from './metadata/metadata.module';
import { RecordsModule } from './records/records.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        DatabaseModule,
        AuditModule,
        TenancyModule,
        AuthModule,
        MembersModule,
        MetadataModule,
        RecordsModule,
        HealthModule,
      ],
    };
  }
}
