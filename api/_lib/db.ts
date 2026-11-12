import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { HttpError } from './http.js';

// Tables are created on first use, so a fresh database needs no manual setup.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  name text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  country text, region text, city text, device text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  score integer, duration_s integer, targets integer, gold integer, hurdles integer, orbs integer, best_combo real,
  flagged boolean NOT NULL DEFAULT false,
  country text, region text, city text, device text, browser text
);
CREATE INDEX IF NOT EXISTS plays_player_idx ON plays (player_id);
CREATE INDEX IF NOT EXISTS plays_started_idx ON plays (started_at);
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  play_id uuid REFERENCES plays(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS visits (
  id bigserial PRIMARY KEY,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  referrer text,
  country text, region text, city text, device text, browser text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_created_idx ON visits (created_at);
`;

// A Cloudflare Worker cannot reuse a connection from an earlier request, so each request opens
// one client, its queries share it, and withDatabase() closes it when the request is done.
type Scope = { client?: Promise<pg.Client> };
const requestScope = new AsyncLocalStorage<Scope>();
let migrated = false;

async function migrate(client: pg.Client): Promise<void> {
  try {
    // the lock stops two first requests from creating the same tables at once
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(727274)');
    await client.query(SCHEMA);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

async function connect(): Promise<pg.Client> {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) throw new HttpError(503, 'The database is not connected. Set DATABASE_URL in the environment variables.');
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    if (!migrated) {
      await migrate(client);
      migrated = true;
    }
    return client;
  } catch (err) {
    await client.end().catch(() => undefined);
    throw err;
  }
}

export async function withDatabase<T>(work: () => Promise<T>): Promise<T> {
  const scope: Scope = {};
  try {
    return await requestScope.run(scope, work);
  } finally {
    await scope.client?.then((client) => client.end()).catch(() => undefined);
  }
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const scope = requestScope.getStore();
  if (!scope) throw new Error('query() must run inside withDatabase()');
  scope.client ??= connect();
  const result = await (await scope.client).query(text, params);
  return result.rows as T[];
}
