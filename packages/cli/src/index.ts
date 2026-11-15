#!/usr/bin/env node
/**
 * bytecontent - developer CLI for the platform.
 *
 * Connection: --url / BYTECONTENT_URL (default http://localhost:4000) and
 * --api-key / BYTECONTENT_API_KEY (an API key with metadata scopes).
 */
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { createClient, PlatformError, type PlatformClient } from '@bytecontent/sdk';
import { CliError, diffSchema, exportSchema, formatPlan, pushSchema, writeTypes } from './commands';

const program = new Command();

program
  .name('bytecontent')
  .description('Developer CLI for the metadata-driven application platform')
  .option('--url <url>', 'API base URL', process.env.BYTECONTENT_URL ?? 'http://localhost:4000')
  .option(
    '--api-key <key>',
    'API key (or set BYTECONTENT_API_KEY)',
    process.env.BYTECONTENT_API_KEY,
  );

function client(): PlatformClient {
  const { url, apiKey } = program.opts<{ url: string; apiKey?: string }>();
  if (!apiKey)
    throw new CliError('An API key is required: pass --api-key or set BYTECONTENT_API_KEY.');
  return createClient({ baseUrl: url, apiKey });
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

program
  .command('entities:list')
  .description('List entities of the tenant')
  .action(async () => {
    const entities = await client().entities.list();
    if (entities.length === 0) return console.log('No entities.');
    for (const e of entities) {
      console.log(
        `${e.key.padEnd(24)} ${e.name.padEnd(24)} ${String(e.fields.length).padStart(3)} fields  v${e.version}  ${e.status}`,
      );
    }
  });

program
  .command('export')
  .description('Write the schema to <dir>/entities/*.json')
  .option('-d, --dir <dir>', 'Project directory', '.')
  .action(async (opts: { dir: string }) => {
    const files = await exportSchema(client(), opts.dir);
    console.log(
      `Exported ${files.length} entit${files.length === 1 ? 'y' : 'ies'} to ${opts.dir}/entities`,
    );
  });

program
  .command('schema:diff')
  .description('Show what schema:push would change (read-only)')
  .option('-d, --dir <dir>', 'Project directory', '.')
  .option('--prune', 'Include deletions of entities/fields missing from the files')
  .action(async (opts: { dir: string; prune?: boolean }) => {
    console.log(formatPlan(await diffSchema(client(), opts.dir, opts.prune)));
  });

for (const name of ['schema:push', 'import']) {
  program
    .command(name)
    .description('Apply the schema files to the installation (shows a plan first)')
    .option('-d, --dir <dir>', 'Project directory', '.')
    .option('--prune', 'Delete entities/fields missing from the files')
    .option('-y, --yes', 'Do not ask for confirmation')
    .option('--allow-destructive', 'Allow deleting entities, fields and their data')
    .action(
      async (opts: { dir: string; prune?: boolean; yes?: boolean; allowDestructive?: boolean }) => {
        await pushSchema(client(), opts.dir, {
          ...opts,
          confirm,
          log: (line) => console.log(line),
        });
      },
    );
}

program
  .command('types')
  .description('Generate TypeScript interfaces for entity records')
  .option('-o, --out <file>', 'Output file', 'platform-types.ts')
  .action(async (opts: { out: string }) => {
    await writeTypes(client(), opts.out);
    console.log(`Wrote ${opts.out}`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof CliError) console.error(error.message);
  else if (error instanceof PlatformError)
    console.error(`API error ${error.status} ${error.code}: ${error.message}`);
  else console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
