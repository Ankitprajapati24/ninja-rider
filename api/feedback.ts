import { query } from './_lib/db.js';
import { handle, HttpError, int, json, readJson, uuid } from './_lib/http.js';
import { requirePlayer } from './_lib/auth.js';

const MAX_PER_HOUR = 5, MAX_MESSAGE = 1000;

// POST /api/feedback { playerId, playId?, rating, message? }  (header x-player-token)
export const POST = handle(async (request) => {
  const body = await readJson(request);
  const player = await requirePlayer(request, uuid(body.playerId, 'playerId'));
  const rating = int(body.rating, 1, 5, 'rating');
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) || null : null;
  const playId = body.playId == null ? null : uuid(body.playId, 'playId');

  const [recent] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM feedback WHERE player_id = $1 AND created_at > now() - interval '1 hour'`,
    [player.id],
  );
  if (recent.n >= MAX_PER_HOUR) throw new HttpError(429, 'Thanks, we already have your feedback. You can send more in an hour.');

  // the round link is kept only when that round belongs to this player
  await query(
    `INSERT INTO feedback (player_id, play_id, rating, message)
     VALUES ($1, (SELECT id FROM plays WHERE id = $2 AND player_id = $1), $3, $4)`,
    [player.id, playId, rating, message],
  );
  return json({ ok: true }, 201);
});
