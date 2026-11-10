import { migrate } from '../src/database/migrate.js';
import { createDatabasePool } from '../src/database/pool.js';

async function main() {
  const pool = createDatabasePool();
  try {
    const applied = await migrate(pool);
    console.log(applied.length > 0
      ? `Applied migrations: ${applied.join(', ')}`
      : 'Database migrations are up to date.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Database migration failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
