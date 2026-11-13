import { Global, Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplateUpgradeService } from './template-upgrade.service';
import { TemplatesService } from './templates.service';

@Global()
@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplateUpgradeService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
