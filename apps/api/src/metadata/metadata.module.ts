import { Global, Module } from '@nestjs/common';
import { MetadataController } from './metadata.controller';
import { MetadataHooks } from './metadata-hooks';
import { MetadataService } from './metadata.service';

@Global()
@Module({
  controllers: [MetadataController],
  providers: [MetadataService, MetadataHooks],
  exports: [MetadataService, MetadataHooks],
})
export class MetadataModule {}
