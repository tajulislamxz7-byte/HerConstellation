// Small response/request helpers shared by every function.
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers }
  });

export const fail = (status, message, extra = {}) =>
  json({ error: message, ...extra }, status, { 'cache-control': 'no-store' });

export const PUBLIC_CACHE = { 'cache-control': 'public, max-age=0, s-maxage=30' };
export const NO_STORE = { 'cache-control': 'no-store' };

// Reads a JSON body with a hard size limit. Throws an Error with .status on bad input.
export async function readJson(req, limit = 100_000) {
  const type = req.headers.get('content-type') || '';
  if (!type.toLowerCase().startsWith('application/json')) throw httpError(415, 'Content-Type must be application/json');
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > limit) throw httpError(413, 'Request body too large');
  const text = await req.text();
  if (text.length > limit) throw httpError(413, 'Request body too large');
  try { return JSON.parse(text); } catch { throw httpError(400, 'Invalid JSON'); }
}

export function httpError(status, message, extra) {
  const e = new Error(message); e.status = status; e.extra = extra; return e;
}

// Wraps a handler so thrown httpErrors become JSON errors and nothing internal leaks.
export const wrap = (fn) => async (req, context) => {
  try { return await fn(req, context); }
  catch (e) {
    if (e && e.status) return fail(e.status, e.message, e.extra);
    console.error('Unhandled error:', e);
    return fail(500, 'Internal error');
  }
};

export const methodNotAllowed = (allow) =>
  new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'content-type': 'application/json', allow: allow.join(', '), 'cache-control': 'no-store' }
  });
