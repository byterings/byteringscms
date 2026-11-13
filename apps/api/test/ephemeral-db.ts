import { randomBytes } from 'node:crypto';
import { fixtureDb } from './fixtures';
import { migrateDeploy } from './migrate';
import { TEST_DATABASE_URL } from './test-db-url';

/**
 * Creates a brand-new, migrated database for tests that need an empty
 * installation (e.g. first-run setup). Only databases created here are
 * ever dropped.
 */
export async function createEphemeralDatabase(): Promise<{
  url: string;
  drop: () => Promise<void>;
}> {
  const name = `byterings_t_${randomBytes(5).toString('hex')}`;
  await fixtureDb().$executeRawUnsafe(`CREATE DATABASE ${name}`);
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  migrateDeploy(url.toString());
  return {
    url: url.toString(),
    drop: async () => {
      await fixtureDb().$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    },
  };
}
