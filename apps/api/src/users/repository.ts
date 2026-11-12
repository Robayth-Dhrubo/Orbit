import type { Pool, PoolClient } from "pg";

type Database = Pool | PoolClient;

export type UserRole = "student" | "tutor";

export type User = {
  id: string;
  email: string;
  role: UserRole;
};

// Authentication-only data: never send this record as an API response.
export type UserRecord = User & {
  passwordHash: string;
};

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  role: UserRole;
};

export async function createUser(db: Database, input: CreateUserInput): Promise<User> {
  // Authentication or the seed script supplies an already-hashed password.
  const { rows } = await db.query<User>(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) " +
      "RETURNING id, email, role",
    [input.email.trim().toLowerCase(), input.passwordHash, input.role],
  );
  return rows[0];
}

export async function findUserById(db: Database, userId: string): Promise<User | undefined> {
  const { rows } = await db.query<User>(
    "SELECT id, email, role FROM users WHERE id = $1",
    [userId],
  );
  return rows[0];
}

export async function findUserByEmail(db: Database, email: string): Promise<User | undefined> {
  const { rows } = await db.query<User>(
    "SELECT id, email, role FROM users WHERE email = $1",
    [email.trim().toLowerCase()],
  );
  return rows[0];
}

export async function findUserCredentialsByEmail(
  db: Database,
  email: string,
): Promise<UserRecord | undefined> {
  const { rows } = await db.query<UserRecord>(
    'SELECT id, email, role, password_hash AS "passwordHash" FROM users WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  return rows[0];
}
