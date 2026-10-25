import { passwordMatches, makeToken, sessionCookie, clearCookie, isAuthed, authConfigured,
  checkRateLimit, recordFailure, clearFailures, clientIp } from './_lib/auth.mjs';
import { json, fail, readJson, wrap, methodNotAllowed, NO_STORE, httpError } from './_lib/http.mjs';

export default wrap(async (req, context) => {
  const action = new URL(req.url).pathname.split('/').pop();
  if (action === 'session') {
    if (req.method !== 'GET') return methodNotAllowed(['GET']);
    return json({ authenticated: isAuthed(req), loginEnabled: authConfigured() }, 200, NO_STORE);
  }
  if (req.method !== 'POST') return methodNotAllowed(['POST']);
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) throw httpError(403, 'Cross-origin request refused');
  if (action === 'logout') return json({ ok: true }, 200, { ...NO_STORE, 'set-cookie': clearCookie() });
  if (action !== 'login') return fail(404, 'Not found');

  if (!authConfigured()) return fail(503, 'Admin login is disabled: ADMIN_PASSWORD / SESSION_SECRET not set');
  const ip = clientIp(req, context);
  await checkRateLimit(ip);
  const body = await readJson(req, 2000);
  const ok = typeof body?.password === 'string' && body.password.length <= 200 && passwordMatches(body.password);
  if (!ok) { await recordFailure(ip); return fail(401, 'Wrong password'); }
  await clearFailures(ip);
  return json({ ok: true }, 200, { ...NO_STORE, 'set-cookie': sessionCookie(makeToken()) });
});
export const config = { path: '/api/auth/*' };
