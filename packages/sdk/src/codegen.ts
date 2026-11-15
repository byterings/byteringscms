import {
  fieldConfigSchemas,
  type EntityDefinition,
  type FieldDefinition,
} from '@bytecontent/contracts';

function pascal(key: string): string {
  return key
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('');
}

function tsType(field: FieldDefinition): string {
  switch (field.type) {
    case 'text':
    case 'longtext':
    case 'decimal':
    case 'date':
    case 'datetime':
      return 'string';
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'select':
      return fieldConfigSchemas.select
        .parse(field.config)
        .options.map((o) => JSON.stringify(o.value))
        .join(' | ');
    case 'multiselect':
      return `Array<${fieldConfigSchemas.multiselect
        .parse(field.config)
        .options.map((o) => JSON.stringify(o.value))
        .join(' | ')}>`;
    case 'relation':
      return fieldConfigSchemas.relation.parse(field.config).cardinality === 'many'
        ? 'string[]'
        : 'string';
    case 'media':
      return fieldConfigSchemas.media.parse(field.config).multiple ? 'string[]' : 'string';
  }
}

/**
 * Generates TypeScript interfaces for entity record data, for use with
 * `client.records<Product>('product')`.
 */
export function generateTypes(entities: EntityDefinition[]): string {
  const lines = [
    '// Generated from platform metadata. Do not edit by hand.',
    '// Regenerate with: bytecontent types',
    '',
  ];
  for (const entity of [...entities].sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(`/** ${entity.name} (\`${entity.key}\`) */`);
    lines.push(`export interface ${pascal(entity.key)} {`);
    for (const field of entity.fields) {
      const doc = field.description ? ` ${field.description}` : '';
      lines.push(`  /** ${field.label}${doc} */`);
      lines.push(`  ${field.key}: ${tsType(field)}${field.required ? '' : ' | null'};`);
    }
    lines.push('}', '');
  }
  lines.push('export interface EntityTypes {');
  for (const entity of entities)
    lines.push(`  ${JSON.stringify(entity.key)}: ${pascal(entity.key)};`);
  lines.push('}', '');
  return lines.join('\n');
}
