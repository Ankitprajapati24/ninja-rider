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

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

function getPool(): pg.Pool {
  if (pool) return pool;
  // DATABASE_URL is the one to set; Netlify DB sets NETLIFY_DATABASE_URL by itself
  const connectionString = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) throw new HttpError(503, 'The database is not connected. Set DATABASE_URL in the environment variables.');
  pool = new pg.Pool({ connectionString, max: 3 });
  return pool;
}

async function migrate(p: pg.Pool): Promise<void> {
  const client = await p.connect();
  try {
    // the lock stops two cold-starting functions from creating the same tables at once
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(727274)');
    await client.query(SCHEMA);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = getPool();
  ready ??= migrate(p).catch((err) => {
    ready = null;
    throw err;
  });
  await ready;
  const result = await p.query(text, params);
  return result.rows as T[];
}
