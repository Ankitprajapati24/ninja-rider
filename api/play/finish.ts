import { query } from '../_lib/db.js';
import { handle, HttpError, int, json, readJson, uuid } from '../_lib/http.js';
import { requirePlayer } from '../_lib/auth.js';
import { bestScores, publicRows } from '../_lib/scores.js';

// A round lasts 90 s of game time (gold targets add more), so real time can never be shorter.
const MIN_ROUND = 85, CLOCK_SLACK = 5, MAX_POINTS_PER_SECOND = 2000;

// POST /api/play/finish { playerId, playId, score, duration, targets, gold, hurdles, orbs, bestCombo }
export const POST = handle(async (request) => {
  const body = await readJson(request);
  const player = await requirePlayer(request, uuid(body.playerId, 'playerId'));
  const playId = uuid(body.playId, 'playId');
  const score = int(body.score, 0, 1_000_000, 'score');
  const duration = int(body.duration, 0, 1800, 'duration');
  const targets = int(body.targets, 0, 2000, 'targets');
  const gold = int(body.gold, 0, 2000, 'gold');
  const hurdles = int(body.hurdles, 0, 2000, 'hurdles');
  const orbs = int(body.orbs ?? 0, 0, 2000, 'orbs');
  const bestCombo = typeof body.bestCombo === 'number' && body.bestCombo >= 1 && body.bestCombo <= 5 ? body.bestCombo : 1;

  const [play] = await query<{ elapsed: number; finished: boolean }>(
    `SELECT extract(epoch FROM now() - started_at)::float AS elapsed, finished_at IS NOT NULL AS finished
       FROM plays WHERE id = $1 AND player_id = $2`,
    [playId, player.id],
  );
  if (!play) throw new HttpError(404, 'This round was not found.');
  if (play.finished) throw new HttpError(409, 'This round was already saved.');

  // Implausible rounds are kept for the admin page but left off the leaderboard.
  const flagged = duration < MIN_ROUND
    || play.elapsed + CLOCK_SLACK < duration
    || score > duration * MAX_POINTS_PER_SECOND
    || (score > 0 && targets + hurdles + orbs === 0);

  await query(
    `UPDATE plays SET finished_at = now(), score = $3, duration_s = $4, targets = $5, gold = $6, hurdles = $7,
            orbs = $8, best_combo = $9, flagged = $10
      WHERE id = $1 AND player_id = $2`,
    [playId, player.id, score, duration, targets, gold, hurdles, orbs, bestCombo, flagged],
  );

  const [standing] = await query<{ best: number; rank: number; ranked: number }>(
    `WITH best AS (
       SELECT p.player_id, max(p.score) AS score
         FROM plays p JOIN players pl ON pl.id = p.player_id
        WHERE p.finished_at IS NOT NULL AND NOT p.flagged AND NOT pl.hidden
        GROUP BY p.player_id)
     SELECT coalesce((SELECT score FROM best WHERE player_id = $1), 0)::int AS best,
            (1 + (SELECT count(*) FROM best
                   WHERE score > coalesce((SELECT score FROM best WHERE player_id = $1), 0)))::int AS rank,
            (SELECT count(*) FROM best)::int AS ranked`,
    [player.id],
  );

  return json({
    flagged,
    best: standing.best,
    rank: standing.best > 0 ? standing.rank : null,
    ranked: standing.ranked,
    leaderboard: publicRows(await bestScores(10), player.id),
  });
});
