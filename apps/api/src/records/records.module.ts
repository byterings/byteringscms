import { Global, Module } from '@nestjs/common';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { RelationsService } from './relations.service';

@Global()
@Module({
  controllers: [RecordsController],
  providers: [RecordsService, RelationsService],
  exports: [RecordsService, RelationsService],
})
export class RecordsModule {}
