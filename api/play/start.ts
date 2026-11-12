import { query } from '../_lib/db.js';
import { clientInfo, handle, HttpError, json, readJson, uuid } from '../_lib/http.js';
import { requirePlayer } from '../_lib/auth.js';

const MAX_STARTS_PER_10_MIN = 20;

// POST /api/play/start { playerId }  (header x-player-token)
export const POST = handle(async (request) => {
  const body = await readJson(request);
  const player = await requirePlayer(request, uuid(body.playerId, 'playerId'));

  const [recent] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM plays WHERE player_id = $1 AND started_at > now() - interval '10 minutes'`,
    [player.id],
  );
  if (recent.n >= MAX_STARTS_PER_10_MIN) throw new HttpError(429, 'Too many rounds started. Take a short break and try again.');

  const where = clientInfo(request);
  const [play] = await query<{ id: string }>(
    `INSERT INTO plays (player_id, country, region, city, device, browser)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [player.id, where.country, where.region, where.city, where.device, where.browser],
  );
  await query(
    `UPDATE players SET last_seen = now(),
            country = coalesce($2, country), region = coalesce($3, region), city = coalesce($4, city), device = $5
      WHERE id = $1`,
    [player.id, where.country, where.region, where.city, where.device],
  );
  return json({ playId: play.id }, 201);
});
