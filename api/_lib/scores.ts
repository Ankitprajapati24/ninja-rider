import { query } from './db.js';

export type LeaderboardRow = {
  player_id: string; name: string; score: number; city: string | null; country: string | null;
  finished_at: string; hidden: boolean;
};

// Each player's best verified round, highest first.
export function bestScores(limit: number, includeHidden = false): Promise<LeaderboardRow[]> {
  return query<LeaderboardRow>(
    `SELECT best.player_id, pl.name, best.score, best.city, best.country, best.finished_at, pl.hidden
       FROM (SELECT DISTINCT ON (player_id) player_id, score, city, country, finished_at
               FROM plays
              WHERE finished_at IS NOT NULL AND NOT flagged
              ORDER BY player_id, score DESC, finished_at ASC) best
       JOIN players pl ON pl.id = best.player_id
      WHERE $2::boolean OR NOT pl.hidden
      ORDER BY best.score DESC, best.finished_at ASC
      LIMIT $1`,
    [limit, includeHidden],
  );
}

// Public view of the leaderboard: no ids, only a city-level place name; `you` marks the asking player.
export const publicRows = (rows: LeaderboardRow[], youId?: string) =>
  rows.map((row) => ({ name: row.name, score: row.score, place: row.city ?? row.country ?? null, you: row.player_id === youId }));
