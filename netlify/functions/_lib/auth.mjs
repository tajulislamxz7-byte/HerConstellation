// Admin auth: password from env, signed expiring HttpOnly cookie (HMAC-SHA256), per-IP rate limit.
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { httpError } from './http.mjs';
import { rateStore } from './store.mjs';

export const COOKIE = 'admin_session';
export const SESSION_SECONDS = 8 * 60 * 60;
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha = (s) => createHash('sha256').update(String(s)).digest();

export function authConfigured() {
  const { ADMIN_PASSWORD: p, SESSION_SECRET: s } = process.env;
  return !!p && !!s && s.length >= 32;
}
function requireConfigured() {
  if (!authConfigured()) throw httpError(503, 'Admin login is disabled: set ADMIN_PASSWORD and a SESSION_SECRET of 32+ characters');
}

export function passwordMatches(input) {
  requireConfigured();
  return timingSafeEqual(sha(input), sha(process.env.ADMIN_PASSWORD)); // equal-length hashes
}

const sign = (data) => b64u(createHmac('sha256', process.env.SESSION_SECRET).update(data).digest());

export function makeToken(now = Date.now()) {
  requireConfigured();
  const payload = b64u(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS, n: b64u(randomBytes(8)) }));
  return payload + '.' + sign(payload);
}

export function verifyToken(token, now = Date.now()) {
  if (!authConfigured() || typeof token !== 'string') return false;
  const i = token.indexOf('.');
  if (i < 1) return false;
  const payload = token.slice(0, i), sig = token.slice(i + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > now / 1000;
  } catch { return false; }
}

export function readCookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export const sessionCookie = (token) =>
  `${COOKIE}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

export const isAuthed = (req) => verifyToken(readCookie(req, COOKIE));

// Every admin function calls this first. Writes also get a same-origin check (CSRF defence
// on top of SameSite=Strict; the JSON content-type check in readJson forces a CORS preflight).
export function requireAdmin(req) {
  requireConfigured();
  if (!isAuthed(req)) throw httpError(401, 'Not signed in');
  if (!['GET', 'HEAD'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) throw httpError(403, 'Cross-origin request refused');
  }
}

// ---- login rate limit (per IP, stored hashed) ----
export function clientIp(req, context) {
  return context?.ip || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}
const rlKey = (ip) => 'ip-' + createHash('sha256').update(ip).digest('hex').slice(0, 32);

export async function checkRateLimit(ip, now = Date.now()) {
  const rec = await rateStore().get(rlKey(ip), { type: 'json' });
  if (rec && now - rec.first < WINDOW_MS && rec.count >= MAX_FAILS) {
    throw httpError(429, 'Too many failed attempts. Try again later.', { retryAfterSeconds: Math.ceil((rec.first + WINDOW_MS - now) / 1000) });
  }
}
export async function recordFailure(ip, now = Date.now()) {
  const key = rlKey(ip), store = rateStore();
  const rec = await store.get(key, { type: 'json' });
  const fresh = !rec || now - rec.first >= WINDOW_MS;
  await store.setJSON(key, { first: fresh ? now : rec.first, count: fresh ? 1 : rec.count + 1 });
}
export const clearFailures = (ip) => rateStore().delete(rlKey(ip));
