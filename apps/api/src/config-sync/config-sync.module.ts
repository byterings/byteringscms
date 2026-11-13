import { Global, Module } from '@nestjs/common';
import { ConfigSyncController } from './config-sync.controller';
import { ConfigSyncService } from './config-sync.service';

@Global()
@Module({
  controllers: [ConfigSyncController],
  providers: [ConfigSyncService],
  exports: [ConfigSyncService],
})
export class ConfigSyncModule {}
