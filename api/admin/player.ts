import { query } from '../_lib/db.js';
import { handle, HttpError, json, readJson, uuid } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';

// POST /api/admin/player { playerId, action: 'hide' | 'show' | 'delete' }
// Hiding keeps a player's data but takes them off the public leaderboard (for rude names);
// deleting removes the player with all their rounds, visits and feedback.
export const POST = handle(async (request) => {
  await requireAdmin(request);
  const body = await readJson(request);
  const playerId = uuid(body.playerId, 'playerId');
  const action = body.action;

  let rows: { id: string }[];
  if (action === 'hide' || action === 'show') {
    rows = await query('UPDATE players SET hidden = $2 WHERE id = $1 RETURNING id', [playerId, action === 'hide']);
  } else if (action === 'delete') {
    rows = await query('DELETE FROM players WHERE id = $1 RETURNING id', [playerId]);
  } else {
    throw new HttpError(400, "action must be 'hide', 'show' or 'delete'.");
  }
  if (!rows.length) throw new HttpError(404, 'Player not found.');
  return json({ ok: true });
});
