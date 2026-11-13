import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { TEST_DATABASE_URL } from './test-db-url';

/**
 * Applies pending migrations to the test database once before the suite runs.
 * Non-destructive: tests isolate themselves by creating uniquely named
 * tenants/users instead of wiping the database.
 */
export default function setup(): void {
  const apiRoot = resolve(__dirname, '..');
  const prismaBin = resolve(
    apiRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  execFileSync(prismaBin, ['migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}
