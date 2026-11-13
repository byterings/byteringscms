import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError, formatPlan, loadSchema } from './commands';

async function project(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'byterings-cli-'));
  await mkdir(join(dir, 'entities'));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(
      join(dir, 'entities', name),
      typeof content === 'string' ? content : JSON.stringify(content),
    );
  }
  return dir;
}

describe('loadSchema', () => {
  it('loads entity files into a config document', async () => {
    const dir = await project({ 'product.json': { key: 'product', name: 'Product', fields: [] } });
    expect(await loadSchema(dir)).toEqual({
      version: 1,
      entities: [{ key: 'product', name: 'Product', fields: [] }],
    });
  });

  it('reports invalid files with their path', async () => {
    await expect(loadSchema(await project({ 'x.json': '{nope' }))).rejects.toThrow(
      /x\.json: invalid JSON/,
    );
    await expect(loadSchema(await project({ 'x.json': { key: 'x' } }))).rejects.toThrow(
      /x\.json: name/,
    );
    await expect(
      loadSchema(await project({ 'wrong.json': { key: 'product', name: 'P', fields: [] } })),
    ).rejects.toBeInstanceOf(CliError);
  });

  it('explains a missing schema directory', async () => {
    await expect(loadSchema(join(tmpdir(), 'does-not-exist-123'))).rejects.toThrow(
      /byterings export/,
    );
  });
});

describe('formatPlan', () => {
  it('summarizes changes and conflicts', () => {
    const text = formatPlan({
      applied: false,
      destructive: true,
      changes: [
        { action: 'createEntity', entity: 'tag', destructive: false },
        {
          action: 'updateField',
          entity: 'post',
          field: 'title',
          changes: ['label'],
          destructive: false,
        },
        { action: 'deleteField', entity: 'post', field: 'old', destructive: true },
      ],
      conflicts: [{ entity: 'post', field: 'body', message: 'Field type cannot change' }],
    });
    expect(text).toContain('Plan: 3 change(s), including destructive changes, 1 conflict(s)');
    expect(text).toContain('+ createEntity tag');
    expect(text).toContain('~ updateField post.title (label)');
    expect(text).toContain('- deleteField post.old  [destructive]');
    expect(text).toContain('! conflict post.body: Field type cannot change');
  });

  it('reports when nothing changes', () => {
    expect(formatPlan({ applied: false, destructive: false, changes: [], conflicts: [] })).toMatch(
      /No changes/,
    );
  });
});
