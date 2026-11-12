import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { query } from './db.js';
import { HttpError } from './http.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

export const newToken = (): string => randomBytes(24).toString('base64url');
export const hashToken = (token: string): string => sha256(token).toString('hex');

export type Player = { id: string; name: string };

// The game keeps a secret token per player, so nobody else can post scores under that name.
export async function findPlayer(request: Request, playerId: string): Promise<Player | null> {
  const token = request.headers.get('x-player-token');
  if (!token) return null;
  const rows = await query<Player>('SELECT id, name FROM players WHERE id = $1 AND token_hash = $2', [playerId, hashToken(token)]);
  return rows[0] ?? null;
}

export async function requirePlayer(request: Request, playerId: string): Promise<Player> {
  const player = await findPlayer(request, playerId);
  if (!player) throw new HttpError(401, 'Player not recognised. Enter your name again to keep playing.');
  return player;
}

export async function requireAdmin(request: Request): Promise<void> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new HttpError(503, 'Admin access is not set up. Add ADMIN_PASSWORD to the environment variables.');
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!given || !timingSafeEqual(sha256(given), sha256(expected))) {
    // slows down password guessing
    await new Promise((resolve) => setTimeout(resolve, 600));
    throw new HttpError(401, 'Wrong password.');
  }
}
