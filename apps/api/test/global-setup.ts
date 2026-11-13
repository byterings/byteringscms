import { migrateDeploy } from './migrate';
import { TEST_DATABASE_URL } from './test-db-url';

/**
 * Applies pending migrations to the shared test database once before the
 * suite runs. Non-destructive: tests isolate themselves by creating uniquely
 * named tenants/users, or use a throwaway database (see ephemeral-db.ts).
 */
export default function setup(): void {
  migrateDeploy(TEST_DATABASE_URL);
}
