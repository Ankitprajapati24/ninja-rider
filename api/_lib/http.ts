const MAX_BODY = 4000;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// Wraps a route handler so expected errors become JSON answers and unexpected ones are logged.
export const handle = (fn: (request: Request) => Promise<Response>) => async (request: Request): Promise<Response> => {
  try {
    return await fn(request);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong on the server. Try again in a moment.' }, 500);
  }
};

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request is too large.');
  try {
    const value: unknown = JSON.parse(text || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // falls through to the error below
  }
  throw new HttpError(400, 'Request body must be a JSON object.');
}

export function int(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${field} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

export function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, `${field} is missing or invalid.`);
  }
  return value.toLowerCase();
}

export function playerName(value: unknown): string {
  const name = typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 20) throw new HttpError(400, 'Name must be 2 to 20 characters.');
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(name)) throw new HttpError(400, 'Name can use letters, numbers, spaces and . _ \' - only.');
  return name;
}

function deviceOf(ua: string): string {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

function browserOf(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
  if (/CriOS|Chrome/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  return 'Other';
}

export type Geo = { country: string | null; region: string | null; city: string | null };
export type ClientInfo = Geo & { device: string; browser: string };

// Filled in by the hosting entry point (netlify/functions/api.ts) from Netlify's own lookup,
// so a client cannot fake its location by sending headers.
const geoByRequest = new WeakMap<Request, Geo>();

export function setGeo(request: Request, geo: Geo): void {
  geoByRequest.set(request, geo);
}

// Approximate location only; the IP address itself is never stored.
export function clientInfo(request: Request): ClientInfo {
  const ua = request.headers.get('user-agent') ?? '';
  const geo = geoByRequest.get(request);
  return {
    country: geo?.country ?? null,
    region: geo?.region ?? null,
    city: geo?.city ?? null,
    device: deviceOf(ua),
    browser: browserOf(ua),
  };
}
