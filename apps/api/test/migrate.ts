import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Applies migrations to the given database (non-destructive). */
export function migrateDeploy(databaseUrl: string): void {
  const apiRoot = resolve(__dirname, '..');
  const prismaBin = resolve(
    apiRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  execFileSync(prismaBin, ['migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}
