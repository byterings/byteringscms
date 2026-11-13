import { Injectable } from '@nestjs/common';
import { type RecordItem } from '@byteringscms/contracts';
import { AppError } from '../common/app-error';
import { type TenantContext } from '../common/request-context';
import { type Tx } from '../database/tenant-db.service';
import { type EntityWithFields } from '../metadata/metadata.mapper';
import { type RecordData } from './record-validation';

/**
 * Relationship handling for the record engine. Phase 3 placeholder:
 * relation values are format-validated by the field registry, but target
 * validation, link storage and expansion arrive in Phase 5.
 */
@Injectable()
export class RelationsService {
  async validateTargets(
    _tx: Tx,
    _ctx: TenantContext,
    _entity: EntityWithFields,
    _values: RecordData,
  ): Promise<void> {}

  async syncLinks(
    _tx: Tx,
    _ctx: TenantContext,
    _entity: EntityWithFields,
    _recordId: string,
    _data: RecordData,
  ): Promise<void> {}

  async expand(
    _tx: Tx,
    _ctx: TenantContext,
    _entity: EntityWithFields,
    _items: RecordItem[],
    expand: string | undefined,
  ): Promise<void> {
    if (expand) throw AppError.badRequest('INVALID_EXPAND', 'Relation expansion is not available');
  }
}
