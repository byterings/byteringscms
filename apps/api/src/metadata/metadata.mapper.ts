import {
  type EntityDefinition,
  type FieldDefinition,
  type FieldType,
} from '@byteringscms/contracts';
import { type Entity, type Field } from '@prisma/client';

export type EntityWithFields = Entity & { fields: Field[] };

export function toField(row: Field): FieldDefinition {
  return {
    id: row.id,
    entityId: row.entityId,
    key: row.key,
    label: row.label,
    type: row.type as FieldType,
    description: row.description,
    required: row.required,
    unique: row.unique,
    isPublic: row.isPublic,
    readMinRole: row.readMinRole,
    writeMinRole: row.writeMinRole,
    defaultValue: row.defaultValue ?? null,
    config: (row.config ?? {}) as Record<string, unknown>,
    position: row.position,
    owner: row.owner,
    overridden: row.overridden,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toEntity(row: EntityWithFields): EntityDefinition {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    pluralName: row.pluralName,
    description: row.description,
    titleField: row.titleField,
    publicRead: row.publicRead,
    publishField: row.publishField,
    publishValue: row.publishValue,
    status: row.status,
    owner: row.owner,
    overridden: row.overridden,
    version: row.version,
    fields: [...row.fields].sort((a, b) => a.position - b.position).map(toField),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const withFields = { fields: { orderBy: { position: 'asc' as const } } };
