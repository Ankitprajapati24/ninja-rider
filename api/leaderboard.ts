import { handle, json } from './_lib/http.js';
import { bestScores, publicRows } from './_lib/scores.js';

// GET /api/leaderboard
export const GET = handle(async () => json({ leaderboard: publicRows(await bestScores(10)) }));
