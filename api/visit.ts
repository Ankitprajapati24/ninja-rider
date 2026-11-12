import { query } from './_lib/db.js';
import { clientInfo, handle, json, readJson } from './_lib/http.js';
import { findPlayer } from './_lib/auth.js';

// POST /api/visit { playerId?, referrer? }
// Counts each time the game page is opened, whether or not a round is played.
export const POST = handle(async (request) => {
  const body = await readJson(request);
  const player = typeof body.playerId === 'string' ? await findPlayer(request, body.playerId).catch(() => null) : null;
  const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 120) || null : null;
  const where = clientInfo(request);
  await query(
    `INSERT INTO visits (player_id, referrer, country, region, city, device, browser)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [player?.id ?? null, referrer, where.country, where.region, where.city, where.device, where.browser],
  );
  return json({ ok: true });
});
