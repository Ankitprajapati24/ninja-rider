import { query } from '../_lib/db.js';
import { handle, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { bestScores } from '../_lib/scores.js';

// GET /api/admin/stats?days=30&tz=Asia/Kolkata  (header Authorization: Bearer <ADMIN_PASSWORD>)
export const GET = handle(async (request) => {
  await requireAdmin(request);
  const params = new URL(request.url).searchParams;
  const days = Math.min(90, Math.max(7, Number(params.get('days')) || 30));
  const askedTz = params.get('tz') ?? 'UTC';
  const [known] = await query<{ ok: boolean }>('SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = $1) AS ok', [askedTz]);
  const tz = known.ok ? askedTz : 'UTC';

  const [totals, daily, hours, countries, places, devices, browsers, ratings, leaderboard, plays, players, feedback, referrers] = await Promise.all([
    query(
      `SELECT (SELECT count(*) FROM players)::int AS players,
              (SELECT count(*) FROM visits)::int AS visits,
              (SELECT count(*) FROM plays)::int AS plays,
              (SELECT count(*) FROM plays WHERE finished_at IS NOT NULL)::int AS finished,
              (SELECT count(*) FROM plays WHERE flagged)::int AS flagged,
              (SELECT coalesce(sum(duration_s), 0) FROM plays WHERE finished_at IS NOT NULL)::int AS play_seconds,
              (SELECT coalesce(round(avg(score)), 0) FROM plays WHERE finished_at IS NOT NULL AND NOT flagged)::int AS avg_score,
              (SELECT coalesce(max(score), 0) FROM plays WHERE finished_at IS NOT NULL AND NOT flagged)::int AS best_score,
              (SELECT count(*) FROM feedback)::int AS feedback,
              (SELECT round(avg(rating)::numeric, 2) FROM feedback)::float AS avg_rating,
              (SELECT count(*) FROM players WHERE created_at >= date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)::int AS new_players_today,
              (SELECT count(*) FROM plays WHERE started_at >= date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)::int AS plays_today,
              (SELECT count(DISTINCT player_id) FROM plays WHERE started_at >= date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)::int AS players_today,
              (SELECT count(*) FROM (SELECT player_id FROM plays GROUP BY player_id HAVING count(*) > 1) r)::int AS returning_players`,
      [tz],
    ).then((rows) => rows[0]),
    query(
      `WITH days AS (
         SELECT generate_series(date_trunc('day', now() AT TIME ZONE $1) - ($2::int - 1) * interval '1 day',
                                date_trunc('day', now() AT TIME ZONE $1), interval '1 day') AS day)
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              count(p.id)::int AS plays,
              count(DISTINCT p.player_id)::int AS players,
              (SELECT count(*) FROM visits v
                WHERE v.created_at AT TIME ZONE $1 >= d.day AND v.created_at AT TIME ZONE $1 < d.day + interval '1 day')::int AS visits
         FROM days d
         LEFT JOIN plays p ON p.started_at AT TIME ZONE $1 >= d.day AND p.started_at AT TIME ZONE $1 < d.day + interval '1 day'
        GROUP BY d.day ORDER BY d.day`,
      [tz, days],
    ),
    query(
      `SELECT extract(hour FROM started_at AT TIME ZONE $1)::int AS hour, count(*)::int AS plays
         FROM plays GROUP BY 1 ORDER BY 1`,
      [tz],
    ),
    query(
      `SELECT country, count(*)::int AS plays, count(DISTINCT player_id)::int AS players
         FROM plays GROUP BY country ORDER BY plays DESC LIMIT 15`,
    ),
    query(
      `SELECT city, region, country, count(*)::int AS plays, count(DISTINCT player_id)::int AS players
         FROM plays GROUP BY city, region, country ORDER BY plays DESC LIMIT 20`,
    ),
    query(`SELECT device AS name, count(*)::int AS count FROM plays GROUP BY device ORDER BY count DESC`),
    query(`SELECT browser AS name, count(*)::int AS count FROM plays GROUP BY browser ORDER BY count DESC`),
    query(`SELECT rating, count(*)::int AS count FROM feedback GROUP BY rating ORDER BY rating DESC`),
    bestScores(20, true),
    query(
      `SELECT p.id, p.player_id, pl.name, pl.hidden, p.started_at, p.finished_at, p.score, p.duration_s, p.targets,
              p.gold, p.hurdles, p.orbs, p.best_combo, p.flagged, p.country, p.region, p.city, p.device, p.browser
         FROM plays p JOIN players pl ON pl.id = p.player_id
        ORDER BY p.started_at DESC LIMIT 200`,
    ),
    query(
      `SELECT pl.id, pl.name, pl.hidden, pl.created_at, pl.last_seen, pl.country, pl.region, pl.city, pl.device,
              count(p.id)::int AS plays,
              coalesce(max(p.score) FILTER (WHERE p.finished_at IS NOT NULL AND NOT p.flagged), 0)::int AS best,
              coalesce(sum(p.duration_s), 0)::int AS seconds
         FROM players pl LEFT JOIN plays p ON p.player_id = pl.id
        GROUP BY pl.id ORDER BY pl.last_seen DESC LIMIT 300`,
    ),
    query(
      `SELECT f.id, f.rating, f.message, f.created_at, pl.name, p.score
         FROM feedback f LEFT JOIN players pl ON pl.id = f.player_id LEFT JOIN plays p ON p.id = f.play_id
        ORDER BY f.created_at DESC LIMIT 200`,
    ),
    query(
      `SELECT coalesce(referrer, 'Direct') AS name, count(*)::int AS count
         FROM visits GROUP BY 1 ORDER BY count DESC LIMIT 10`,
    ),
  ]);

  return json({
    generatedAt: new Date().toISOString(), tz, days,
    totals, daily, hours, countries, places, devices, browsers, ratings, referrers,
    leaderboard, plays, players, feedback,
  });
});
