import { query } from './_lib/db.js';
import { clientInfo, handle, json, playerName, readJson } from './_lib/http.js';
import { findPlayer, hashToken, newToken } from './_lib/auth.js';

// POST /api/player { name, playerId? }
// Registers a new player, or renames the returning player whose token is sent.
export const POST = handle(async (request) => {
  const body = await readJson(request);
  const name = playerName(body.name);
  const where = clientInfo(request);

  if (typeof body.playerId === 'string') {
    const existing = await findPlayer(request, body.playerId).catch(() => null);
    if (existing) {
      await query(
        `UPDATE players SET name = $2, last_seen = now(),
                country = coalesce($3, country), region = coalesce($4, region), city = coalesce($5, city), device = $6
          WHERE id = $1`,
        [existing.id, name, where.country, where.region, where.city, where.device],
      );
      return json({ playerId: existing.id, name });
    }
  }

  const token = newToken();
  const [created] = await query<{ id: string }>(
    `INSERT INTO players (token_hash, name, country, region, city, device)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [hashToken(token), name, where.country, where.region, where.city, where.device],
  );
  return json({ playerId: created.id, token, name }, 201);
});
