import { Injectable } from '@nestjs/common';
import { type Field } from '@prisma/client';
import { AppError } from '../common/app-error';
import { type Tx } from '../database/tenant-db.service';

/**
 * Keeps stored record data consistent with metadata changes. Every hook
 * runs inside the metadata change's tenant-scoped transaction.
 */
@Injectable()
export class MetadataHooks {
  /** Entities with live records cannot be deleted (soft-deleted ones cascade). */
  async beforeEntityDelete(tx: Tx, tenantId: string, entityId: string): Promise<void> {
    const live = await tx.record.count({ where: { tenantId, entityId, deletedAt: null } });
    if (live > 0) {
      throw AppError.conflict(
        'ENTITY_HAS_RECORDS',
        `The entity still has ${live} record(s); delete them first`,
      );
    }
  }

  /** Removes the field's values from every record of the entity. */
  async beforeFieldDelete(tx: Tx, tenantId: string, entityId: string, field: Field): Promise<void> {
    await tx.$executeRaw`
      UPDATE records
      SET data = data - ${field.key}::text, version = version + 1, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid
        AND entity_id = ${entityId}::uuid
        AND jsonb_exists(data, ${field.key}::text)`;
  }

  async afterFieldChange(_tx: Tx, _tenantId: string, _fieldId: string): Promise<void> {}

  /**
   * Turning uniqueness on backfills the unique index from live records and
   * fails if existing values already collide; turning it off clears it.
   */
  async afterUniqueChange(
    tx: Tx,
    tenantId: string,
    fieldId: string,
    unique: boolean,
  ): Promise<void> {
    if (!unique) {
      await tx.recordUniqueValue.deleteMany({ where: { tenantId, fieldId } });
      return;
    }
    const field = await tx.field.findFirstOrThrow({ where: { id: fieldId, tenantId } });
    const canonical = field.type === 'text' ? CANONICAL_TEXT_VALUE : CANONICAL_VALUE;
    const duplicates = await tx.$queryRawUnsafe<{ value: string }[]>(
      `SELECT ${canonical} AS value
       FROM records
       WHERE tenant_id = $1::uuid AND entity_id = $2::uuid AND deleted_at IS NULL
         AND jsonb_exists(data, $3::text)
       GROUP BY 1 HAVING count(*) > 1 LIMIT 5`,
      tenantId,
      field.entityId,
      field.key,
    );
    if (duplicates.length) {
      throw AppError.conflict(
        'UNIQUE_CONFLICT_EXISTING',
        'Existing records already contain duplicate values for this field',
        duplicates.map((d) => d.value),
      );
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO record_unique_values (tenant_id, field_id, value, record_id)
       SELECT tenant_id, $4::uuid, ${canonical}, id
       FROM records
       WHERE tenant_id = $1::uuid AND entity_id = $2::uuid AND deleted_at IS NULL
         AND jsonb_exists(data, $3::text)`,
      tenantId,
      field.entityId,
      field.key,
      fieldId,
    );
  }

  /** Rejects structural changes to a field that already holds data. */
  async assertFieldEmpty(tx: Tx, tenantId: string, fieldId: string, action: string): Promise<void> {
    const field = await tx.field.findFirstOrThrow({ where: { id: fieldId, tenantId } });
    const [row] = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM records
      WHERE tenant_id = ${tenantId}::uuid AND entity_id = ${field.entityId}::uuid
        AND jsonb_exists(data, ${field.key}::text)`;
    if ((row?.n ?? 0) > 0) {
      throw AppError.conflict('FIELD_HAS_DATA', `Cannot ${action} while records hold values`);
    }
  }
}

// Canonical unique values (must match uniqueValueKey() in record-validation).
// Both reference only the bound parameter $3 (the field key); no input is
// ever interpolated into the SQL text.
const CANONICAL_TEXT_VALUE = 'lower(btrim(data ->> $3::text))';
const CANONICAL_VALUE = '(data ->> $3::text)';
