import { Injectable } from '@nestjs/common';
import { type Field } from '@prisma/client';
import { type Tx } from '../database/tenant-db.service';

/**
 * Extension points the record engine uses to keep stored data consistent
 * with metadata changes (all run inside the metadata transaction).
 * The default implementation does nothing; RecordsModule replaces it.
 */
@Injectable()
export class MetadataHooks {
  async beforeEntityDelete(_tx: Tx, _tenantId: string, _entityId: string): Promise<void> {}

  async beforeFieldDelete(
    _tx: Tx,
    _tenantId: string,
    _entityId: string,
    _field: Field,
  ): Promise<void> {}

  async afterFieldChange(_tx: Tx, _tenantId: string, _fieldId: string): Promise<void> {}

  async afterUniqueChange(
    _tx: Tx,
    _tenantId: string,
    _fieldId: string,
    _unique: boolean,
  ): Promise<void> {}

  async assertFieldEmpty(
    _tx: Tx,
    _tenantId: string,
    _fieldId: string,
    _action: string,
  ): Promise<void> {}
}
