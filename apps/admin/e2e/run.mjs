// End-to-end test runner: creates a throwaway database, runs Playwright
// (which starts the built API and Admin Studio), then drops the database.
//
// Prerequisite: `pnpm build` (API dist and Next.js build).
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const adminRoot = resolve(import.meta.dirname, '..');
const apiRoot = resolve(adminRoot, '..', 'api');
const dbScript = resolve(apiRoot, 'scripts', 'e2e-db.mjs');
const name = `byterings_e2e_${randomBytes(4).toString('hex')}`;

const url = execFileSync(process.execPath, [dbScript, 'create', name], {
  cwd: apiRoot,
  encoding: 'utf8',
});
const storage = mkdtempSync(resolve(tmpdir(), 'byterings-e2e-storage-'));
let status = 1;
try {
  const result = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
    cwd: adminRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, E2E_DATABASE_URL: url, E2E_STORAGE_DIR: storage },
  });
  status = result.status ?? 1;
} finally {
  execFileSync(process.execPath, [dbScript, 'drop', name], { cwd: apiRoot });
  rmSync(storage, { recursive: true, force: true });
}
process.exit(status);
