/**
 * CLI command implementations, exported for programmatic use and tests.
 * Schema files live in `<dir>/entities/<key>.json` (developmentPlan §11.2).
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  configDocumentSchema,
  configEntitySchema,
  type ConfigDocument,
  type ConfigPlan,
} from '@bytecontent/contracts';
import { generateTypes, type PlatformClient } from '@bytecontent/sdk';

export const ENTITIES_DIR = 'entities';

export class CliError extends Error {}

/** Writes one JSON file per entity; removes files of entities that no longer exist. */
export async function exportSchema(client: PlatformClient, dir: string): Promise<string[]> {
  const document = await client.config.export();
  const target = join(dir, ENTITIES_DIR);
  await mkdir(target, { recursive: true });
  const written = new Set<string>();
  for (const entity of document.entities) {
    const file = `${entity.key}.json`;
    await writeFile(join(target, file), `${JSON.stringify(entity, null, 2)}\n`, 'utf8');
    written.add(file);
  }
  for (const file of await readdir(target)) {
    if (file.endsWith('.json') && !written.has(file)) await rm(join(target, file));
  }
  return [...written].sort();
}

/** Reads and validates every entity file. */
export async function loadSchema(dir: string): Promise<ConfigDocument> {
  const source = join(dir, ENTITIES_DIR);
  let files: string[];
  try {
    files = (await readdir(source)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    throw new CliError(`No schema directory found at ${source}. Run "bytecontent export" first.`);
  }
  const entities = [];
  for (const file of files) {
    const path = join(source, file);
    let json: unknown;
    try {
      json = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      throw new CliError(`${path}: invalid JSON (${(error as Error).message})`);
    }
    const parsed = configEntitySchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new CliError(`${path}: ${issue?.path.join('.') || '(root)'}: ${issue?.message}`);
    }
    if (`${parsed.data.key}.json` !== file) {
      throw new CliError(
        `${path}: file name must match the entity key ("${parsed.data.key}.json")`,
      );
    }
    entities.push(parsed.data);
  }
  return configDocumentSchema.parse({ version: 1, entities });
}

const SYMBOLS: Record<string, string> = {
  createEntity: '+',
  createField: '+',
  updateEntity: '~',
  updateField: '~',
  deleteEntity: '-',
  deleteField: '-',
};

/** Human-readable plan. */
export function formatPlan(plan: ConfigPlan): string {
  const lines: string[] = [];
  for (const change of plan.changes) {
    const target = change.field ? `${change.entity}.${change.field}` : change.entity;
    const detail = change.changes?.length ? ` (${change.changes.join(', ')})` : '';
    const warning = change.destructive ? '  [destructive]' : '';
    lines.push(`  ${SYMBOLS[change.action] ?? '?'} ${change.action} ${target}${detail}${warning}`);
  }
  for (const conflict of plan.conflicts) {
    const target = conflict.field ? `${conflict.entity}.${conflict.field}` : conflict.entity;
    lines.push(`  ! conflict ${target}: ${conflict.message}`);
  }
  if (lines.length === 0) return 'No changes. The installation matches the schema files.';
  const summary = `${plan.changes.length} change(s)${plan.destructive ? ', including destructive changes' : ''}${
    plan.conflicts.length ? `, ${plan.conflicts.length} conflict(s)` : ''
  }`;
  return [`Plan: ${summary}`, ...lines].join('\n');
}

export async function diffSchema(
  client: PlatformClient,
  dir: string,
  prune = false,
): Promise<ConfigPlan> {
  return client.config.diff(await loadSchema(dir), { prune });
}

export interface PushOptions {
  prune?: boolean;
  /** Apply without asking (non-destructive plans only unless allowDestructive). */
  yes?: boolean;
  allowDestructive?: boolean;
  confirm?: (question: string) => Promise<boolean>;
  log?: (line: string) => void;
}

/** Shows the plan, asks for confirmation, then applies it atomically. */
export async function pushSchema(
  client: PlatformClient,
  dir: string,
  opts: PushOptions = {},
): Promise<ConfigPlan> {
  const log = opts.log ?? (() => undefined);
  const document = await loadSchema(dir);
  const plan = await client.config.diff(document, { prune: opts.prune });
  log(formatPlan(plan));
  if (plan.conflicts.length) throw new CliError('Resolve the conflicts above before pushing.');
  if (plan.changes.length === 0) return plan;
  if (plan.destructive && !opts.allowDestructive) {
    throw new CliError(
      'The plan deletes entities or fields. Re-run with --allow-destructive to apply it.',
    );
  }
  if (!opts.yes) {
    const ok = opts.confirm ? await opts.confirm('Apply these changes?') : false;
    if (!ok) throw new CliError('Aborted. Nothing was changed.');
  }
  const applied = await client.config.apply(document, {
    prune: opts.prune,
    confirmDestructive: plan.destructive && opts.allowDestructive === true,
  });
  log(`Applied ${applied.changes.length} change(s).`);
  return applied;
}

/** Generates TypeScript interfaces for the tenant's entities. */
export async function writeTypes(client: PlatformClient, out: string): Promise<void> {
  const entities = await client.entities.list();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateTypes(entities), 'utf8');
}
