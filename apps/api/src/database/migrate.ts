import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { Pool } from 'pg';

type Migration = {
  version: number;
  name: string;
  sql: string;
  checksum: string;
};

type AppliedMigration = Pick<Migration, 'version' | 'name' | 'checksum'>;

const migrationDirectory = new URL('../../../../database/migrations/', import.meta.url);

async function readMigrations(): Promise<Migration[]> {
  const migrations: Migration[] = [];
  const entries = await readdir(migrationDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
    const match = /^(\d+)_([a-z0-9_]+)\.sql$/.exec(entry.name);
    const version = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(version) || version < 1 || version > 2_147_483_647) {
      throw new Error(`Invalid migration filename: ${entry.name}`);
    }
    const sql = await readFile(new URL(entry.name, migrationDirectory), 'utf8');
    migrations.push({
      version,
      name: entry.name,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  migrations.sort((a, b) => a.version - b.version);
  if (migrations.length === 0) throw new Error('No SQL migrations were found.');
  for (let index = 1; index < migrations.length; index++) {
    if (migrations[index].version === migrations[index - 1].version) {
      throw new Error(`Duplicate migration version: ${migrations[index].version}`);
    }
  }
  return migrations;
}

/** Apply pending SQL files atomically; an unchanged applied migration is a no-op. */
export async function migrate(pool: Pool): Promise<string[]> {
  const migrations = await readMigrations();
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    // Serialize migration runs, including btree_gist installation, across processes.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      'orbit:schema-migrations',
    ]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY CHECK (version > 0),
        name text NOT NULL UNIQUE,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows: applied } = await client.query<AppliedMigration>(
      'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
    );

    // Applied migrations must remain an unchanged prefix of the files on disk.
    // Change a deployed schema by adding a new file, not editing an applied one.
    for (const [index, previous] of applied.entries()) {
      const current = migrations[index];
      if (!current || current.version !== previous.version || current.name !== previous.name) {
        throw new Error(`Migration history is missing or out of order at ${previous.name}.`);
      }
      if (current.checksum !== previous.checksum) {
        throw new Error(`Applied migration was modified: ${previous.name}`);
      }
    }

    const appliedNames: string[] = [];
    for (const migration of migrations.slice(applied.length)) {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum],
      );
      appliedNames.push(migration.name);
    }
    await client.query('COMMIT');
    return appliedNames;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
