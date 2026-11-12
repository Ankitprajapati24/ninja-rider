// Netlify entry point: every /api/* request lands here and is passed to the matching handler in api/.
// Only the routes listed below are reachable, so api/_lib can never be called from outside.
import * as adminPlayer from '../../api/admin/player.js';
import * as adminStats from '../../api/admin/stats.js';
import * as feedback from '../../api/feedback.js';
import * as leaderboard from '../../api/leaderboard.js';
import * as playFinish from '../../api/play/finish.js';
import * as playStart from '../../api/play/start.js';
import * as player from '../../api/player.js';
import * as visit from '../../api/visit.js';
import { json, setGeo } from '../../api/_lib/http.js';

type Handler = (request: Request) => Promise<Response>;
type Route = Partial<Record<'GET' | 'POST', Handler>>;

// The part of Netlify's context object this site uses. Locally geo is empty.
export type Context = {
  geo?: { city?: string; country?: { code?: string }; subdivision?: { code?: string } };
};

const routes: Record<string, Route> = {
  'admin/player': adminPlayer,
  'admin/stats': adminStats,
  feedback,
  leaderboard,
  'play/finish': playFinish,
  'play/start': playStart,
  player,
  visit,
};

const clip = (value: string | undefined) => (value ? value.slice(0, 80) : null);

export default async (request: Request, context: Context): Promise<Response> => {
  const route = new URL(request.url).pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const methods = Object.hasOwn(routes, route) ? routes[route] : undefined;
  if (!methods) return json({ error: 'Not found' }, 404);
  const handler = methods[request.method as keyof Route];
  if (!handler) return json({ error: 'Method not allowed' }, 405);
  setGeo(request, {
    country: clip(context.geo?.country?.code),
    region: clip(context.geo?.subdivision?.code),
    city: clip(context.geo?.city),
  });
  return handler(request);
};

export const config = { path: '/api/*' };
