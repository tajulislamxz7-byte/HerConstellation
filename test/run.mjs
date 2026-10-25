import assert from 'node:assert/strict';
import { reset, getStore, state } from './fake-blobs.mjs';
import { makeToken, verifyToken, COOKIE } from '../netlify/functions/_lib/auth.mjs';
const F = '../netlify/functions/';
const m = {}; for (const n of ['auth','apps','settings','media','download','admin-apps','admin-meta','admin-backup','seo']) m[n] = (await import(F + n + '.mjs')).default;

process.env.ADMIN_PASSWORD = 'correct horse'; process.env.SESSION_SECRET = 'x'.repeat(40);
const O = 'https://site.test';
const req = (path, { method = 'GET', body, cookie, origin, headers = {} } = {}) => new Request(O + path, {
  method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...headers },
  body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const call = async (fn, path, o, params, ip = '1.1.1.1') => { const r = await fn(req(path, o), { params, ip }); let b = null; try { b = await r.clone().json(); } catch {} return { r, s: r.status, b }; };
let passed = 0; const t = async (name, fn) => { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n    ', e.message); process.exitCode = 1; } };
const login = async (ip = '9.9.9.9') => { const x = await call(m.auth, '/api/auth/login', { method: 'POST', body: { password: 'correct horse' } }, {}, ip); return x.r.headers.get('set-cookie').split(';')[0]; };
const good = { name: 'Notes', category: 'Tools', icon: 'https://x.test/i.png', apkUrl: 'https://x.test/n.apk', published: true, version: '1.0', permissions: ['Storage'], screenshots: ['https://x.test/s.png'] };

await t('login disabled when env missing', async () => {
  const p = process.env.ADMIN_PASSWORD; delete process.env.ADMIN_PASSWORD;
  assert.equal((await call(m.auth, '/api/auth/login', { method: 'POST', body: { password: 'x' } })).s, 503);
  assert.equal((await call(m['admin-apps'], '/api/admin/apps', { cookie: COOKIE + '=' + 'a.b' })).s, 503);
  process.env.ADMIN_PASSWORD = p;
});
await t('short SESSION_SECRET disables login', async () => {
  const s = process.env.SESSION_SECRET; process.env.SESSION_SECRET = 'short';
  assert.equal((await call(m.auth, '/api/auth/login', { method: 'POST', body: { password: 'correct horse' } })).s, 503);
  process.env.SESSION_SECRET = s;
});
await t('wrong password 401, right password sets secure HttpOnly cookie', async () => {
  reset();
  assert.equal((await call(m.auth, '/api/auth/login', { method: 'POST', body: { password: 'nope' } })).s, 401);
  const x = await call(m.auth, '/api/auth/login', { method: 'POST', body: { password: 'correct horse' } });
  assert.equal(x.s, 200);
  const c = x.r.headers.get('set-cookie'); for (const f of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=28800']) assert.ok(c.includes(f), f);
});
await t('rate limit: 5 failures then 429, even for the right password; other IP unaffected', async () => {
  reset();
  for (let i = 0; i < 5; i++) assert.equal((await call(m.auth, '/api/auth/login', { method: 'POST', body: { password: 'bad' } }, {}, '2.2.2.2')).s, 401);
  assert.equal((await call(m.auth, '/api/auth/login', { method: 'POST', body: { password: 'correct horse' } }, {}, '2.2.2.2')).s, 429);
  assert.equal((await call(m.auth, '/api/auth/login', { method: 'POST', body: { password: 'correct horse' } }, {}, '3.3.3.3')).s, 200);
});
await t('token: tampered, truncated, expired and garbage are rejected', async () => {
  const tok = makeToken();
  assert.ok(verifyToken(tok));
  const [p, s] = tok.split('.');
  assert.ok(!verifyToken(p + '.' + s.slice(0, -2) + 'AA'));
  assert.ok(!verifyToken(Buffer.from('{"exp":9999999999}').toString('base64url') + '.' + s));
  assert.ok(!verifyToken(makeToken(Date.now() - 9 * 3600 * 1000)));
  for (const g of ['', 'abc', '.', 'a.b.c', null, undefined]) assert.ok(!verifyToken(g));
});
await t('session endpoint and logout', async () => {
  const c = await login();
  assert.equal((await call(m.auth, '/api/auth/session', { cookie: c })).b.authenticated, true);
  assert.equal((await call(m.auth, '/api/auth/session')).b.authenticated, false);
  assert.ok((await call(m.auth, '/api/auth/logout', { method: 'POST', body: {} })).r.headers.get('set-cookie').includes('Max-Age=0'));
});
await t('every admin function rejects unauthenticated requests', async () => {
  for (const [fn, path, method] of [['admin-apps', '/api/admin/apps', 'GET'], ['admin-apps', '/api/admin/apps', 'POST'], ['admin-apps', '/api/admin/apps/zz', 'DELETE'],
    ['admin-meta', '/api/admin/categories', 'PUT'], ['admin-meta', '/api/admin/settings', 'GET'], ['admin-backup', '/api/admin/backup', 'GET'], ['admin-backup', '/api/admin/backup', 'POST']])
    assert.equal((await call(m[fn], path, { method, body: method === 'GET' ? undefined : {} }, path.includes('/zz') ? { id: 'zz' } : {})).s, 401, fn + ' ' + method);
});
await t('cross-origin write refused, wrong content-type refused', async () => {
  const c = await login();
  assert.equal((await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: good, cookie: c, origin: 'https://evil.test' })).s, 403);
  const r = await m['admin-apps'](new Request(O + '/api/admin/apps', { method: 'POST', headers: { cookie: c, 'content-type': 'text/plain' }, body: JSON.stringify(good) }), { params: {} });
  assert.equal(r.status, 415);
});
await t('create / list / update / patch / delete app', async () => {
  reset(); const c = await login();
  const cr = await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: good, cookie: c, origin: O }, {});
  assert.equal(cr.s, 201); const id = cr.b.app.id; assert.match(id, /^[0-9a-f]{12}$/);
  assert.equal((await call(m['admin-apps'], '/api/admin/apps', { cookie: c }, {})).b.apps.length, 1);
  const up = await call(m['admin-apps'], '/api/admin/apps/' + id, { method: 'PUT', body: { ...good, name: 'Notes 2' }, cookie: c }, { id });
  assert.equal(up.b.app.name, 'Notes 2'); assert.equal(up.b.app.id, id);
  assert.equal((await call(m['admin-apps'], '/api/admin/apps/' + id, { method: 'PATCH', body: { published: false }, cookie: c }, { id })).b.app.published, false);
  for (const bad of ['null', '[]', '5']) assert.equal((await call(m['admin-apps'], '/api/admin/apps/' + id, { method: 'PATCH', body: bad, cookie: c }, { id })).s, 400, 'PATCH ' + bad);
  assert.equal((await call(m['admin-apps'], '/api/admin/apps/' + id, { method: 'PATCH', body: { published: 'yes' }, cookie: c }, { id })).s, 400);
  assert.equal((await call(m['admin-apps'], '/api/admin/apps/nope', { method: 'DELETE', cookie: c }, { id: 'nope' })).s, 404);
  assert.equal((await call(m['admin-apps'], '/api/admin/apps/' + id, { method: 'DELETE', cookie: c }, { id })).s, 200);
  assert.equal((await call(m['admin-apps'], '/api/admin/apps', { cookie: c }, {})).b.apps.length, 0);
});
await t('validation rejects bad input', async () => {
  const c = await login(); const post = (b) => call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: b, cookie: c }, {});
  const cases = { 'no name': { ...good, name: '' }, 'long name': { ...good, name: 'x'.repeat(81) }, 'unknown category': { ...good, category: 'Nope' },
    'javascript apk': { ...good, apkUrl: 'javascript:alert(1)' }, 'data icon': { ...good, icon: 'data:image/svg+xml,<svg/>' }, 'ftp apk': { ...good, apkUrl: 'ftp://x/y' }, 'http apk': { ...good, apkUrl: 'http://x.test/a.apk' }, 'http icon': { ...good, icon: 'http://x.test/i.png' }, 'http screenshot': { ...good, screenshots: ['http://x.test/s.png'] },
    'url creds': { ...good, apkUrl: 'https://u:p@x.test/a.apk' }, 'bad media path': { ...good, icon: '/api/media/../../etc' }, 'bad package': { ...good, packageName: 'not a package' },
    'bad date': { ...good, releaseDate: '2026-13-45' }, 'too many shots': { ...good, screenshots: Array(11).fill('https://x.test/a.png') },
    'name is object': { ...good, name: { a: 1 } }, 'array body': [good], 'bad JSON': '{nope' };
  for (const [k, b] of Object.entries(cases)) assert.equal((await post(b)).s, 400, k);
  assert.equal((await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: 'x'.repeat(200_000), cookie: c }, {})).s, 413);
});
await t('hostile text is stored as inert text; client cannot set id/downloads/createdAt', async () => {
  reset(); const c = await login();
  const x = await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', cookie: c, body: { ...good, name: '<img src=x onerror=alert(1)>\u0000', id: 'evil', downloads: 999, createdAt: '1999-01-01' } }, {});
  assert.equal(x.s, 201); assert.equal(x.b.app.name, '<img src=x onerror=alert(1)>'); assert.notEqual(x.b.app.id, 'evil'); assert.equal(x.b.app.downloads, 0); assert.notEqual(x.b.app.createdAt, '1999-01-01');
});
await t('public API hides apkUrl and unpublished apps; detail endpoint', async () => {
  reset(); const c = await login();
  const a = (await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: good, cookie: c }, {})).b.app;
  const hidden = (await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: { ...good, name: 'Draft', published: false }, cookie: c }, {})).b.app;
  await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: { ...good, name: 'NoLink', apkUrl: '' }, cookie: c }, {});
  const pub = await call(m.apps, '/api/apps', {}, {});
  assert.equal(pub.s, 200); assert.equal(pub.b.apps.length, 2); assert.ok(!JSON.stringify(pub.b).includes('x.test/n.apk')); assert.ok(!JSON.stringify(pub.b).includes('Draft'));
  assert.deepEqual(pub.b.apps.map((x) => x.canDownload).sort(), [false, true]); assert.ok(pub.b.categories.includes('Tools'));
  assert.equal(pub.r.headers.get('cache-control'), 'public, max-age=0, s-maxage=30');
  assert.equal((await call(m.apps, '/api/apps/' + a.id, {}, { id: a.id })).s, 200);
  assert.equal((await call(m.apps, '/api/apps/' + hidden.id, {}, { id: hidden.id })).s, 404);
  assert.equal((await call(m.apps, '/api/apps', { method: 'POST', body: {} }, {})).s, 405);
});
await t('download redirects, counts, and 404s for missing/unpublished/no-link', async () => {
  reset(); const c = await login();
  const a = (await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: good, cookie: c }, {})).b.app;
  const d = await call(m.download, '/api/download/' + a.id, {}, { id: a.id });
  assert.equal(d.s, 302); assert.equal(d.r.headers.get('location'), 'https://x.test/n.apk');
  await call(m.download, '/api/download/' + a.id, {}, { id: a.id });
  await call(m.download, '/api/download/' + a.id, { method: 'HEAD' }, { id: a.id });
  assert.equal((await call(m.apps, '/api/apps', {}, {})).b.apps[0].downloads, 2);
  assert.equal((await call(m.download, '/api/download/zzz', {}, { id: 'zzz' })).s, 404);
  await call(m['admin-apps'], '/api/admin/apps/' + a.id, { method: 'PATCH', body: { published: false }, cookie: c }, { id: a.id });
  assert.equal((await call(m.download, '/api/download/' + a.id, {}, { id: a.id })).s, 404);
});
await t('categories: validation, duplicate names, refuse removing a used category', async () => {
  reset(); const c = await login(); const put = (b) => call(m['admin-meta'], '/api/admin/categories', { method: 'PUT', body: b, cookie: c });
  await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: good, cookie: c }, {});
  assert.equal((await put({ categories: ['Tools', 'tools'] })).s, 400);
  assert.equal((await put({ categories: 'x' })).s, 400);
  assert.equal((await put({ categories: ['Games'] })).s, 409);
  assert.equal((await put({ categories: ['Tools', 'Music'] })).s, 200);
  assert.deepEqual((await call(m['admin-meta'], '/api/admin/categories', { cookie: c })).b.categories, ['Tools', 'Music']);
});
await t('settings: defaults, update, validation, public exposure', async () => {
  reset(); const c = await login();
  assert.equal((await call(m.settings, '/api/settings', {}, {})).b.siteName, 'App Library');
  const put = (b) => call(m['admin-meta'], '/api/admin/settings', { method: 'PUT', body: b, cookie: c });
  assert.equal((await put({ siteName: '' })).s, 400); assert.equal((await put({ siteName: 'S', contactEmail: 'bad' })).s, 400);
  assert.equal((await put({ siteName: 'My Site', contactEmail: 'a@b.co', logo: 'javascript:1' })).s, 400);
  assert.equal((await put({ siteName: 'My Site', contactEmail: 'a@b.co' })).s, 200);
  const pub = (await call(m.settings, '/api/settings', {}, {})).b; assert.equal(pub.siteName, 'My Site'); assert.deepEqual(Object.keys(pub).sort(), ['contactEmail', 'heroText', 'heroTitle', 'logo', 'siteName', 'tagline']);
});
await t('media: serves allowed types with safe headers; rejects traversal/unknown', async () => {
  reset(); await getStore('media').set('a.png', new Uint8Array([1, 2, 3]), { metadata: { contentType: 'image/png' } });
  await getStore('media').set('evil.html', '<script>1</script>', { metadata: { contentType: 'text/html' } });
  const ok = await call(m.media, '/api/media/a.png', {}, { key: 'a.png' }); assert.equal(ok.s, 200); assert.equal(ok.r.headers.get('content-type'), 'image/png');
  const ev = await call(m.media, '/api/media/evil.html', {}, { key: 'evil.html' }); assert.equal(ev.r.headers.get('content-type'), 'application/octet-stream'); assert.equal(ev.r.headers.get('x-content-type-options'), 'nosniff');
  for (const k of ['../x', 'a/b', '', 'a..b', 'x'.repeat(101), 'missing.png']) assert.equal((await call(m.media, '/api/media/' + k, {}, { key: k })).s, 404, k);
});
await t('backup: export, import round-trip, and bad imports write nothing', async () => {
  reset(); const c = await login();
  const a = (await call(m['admin-apps'], '/api/admin/apps', { method: 'POST', body: good, cookie: c }, {})).b.app;
  await call(m.download, '/api/download/' + a.id, {}, { id: a.id });
  const exp = (await call(m['admin-backup'], '/api/admin/backup', { cookie: c })).b; assert.equal(exp.apps.length, 1); assert.equal(exp.downloads[a.id], 1);
  reset(); const c2 = await login('8.8.8.8');
  const imp = (b) => call(m['admin-backup'], '/api/admin/backup', { method: 'POST', body: b, cookie: c2 });
  assert.equal((await imp(exp)).s, 400);
  assert.equal((await imp({ ...exp, replace: true, version: 2 })).s, 400);
  assert.equal((await imp({ ...exp, replace: true, apps: [{ ...exp.apps[0], apkUrl: 'javascript:1' }] })).s, 400);
  assert.equal((await imp({ ...exp, replace: true, apps: [exp.apps[0], exp.apps[0]] })).s, 400);
  assert.equal((await call(m['admin-apps'], '/api/admin/apps', { cookie: c2 }, {})).b.apps.length, 0, 'failed imports must not write');
  assert.equal((await imp({ ...exp, replace: true })).s, 200);
  const back = (await call(m['admin-apps'], '/api/admin/apps', { cookie: c2 }, {})).b.apps; assert.equal(back[0].id, a.id); assert.equal(back[0].downloads, 1);
});
await t('storage outage returns 500 (not an empty catalog) and leaks no detail', async () => {
  reset(); const c = await login(); state.down = true;
  try {
    for (const [fn, p, o] of [['admin-apps', '/api/admin/apps', { method: 'POST', body: good, cookie: c }], ['apps', '/api/apps', {}], ['download', '/api/download/a', {}]]) {
      const x = await call(m[fn], p, o, { id: 'a' }); assert.equal(x.s, 500, fn); assert.ok(!JSON.stringify(x.b).includes('blobs down'));
    }
  } finally { state.down = false; }
  assert.equal((await call(m['admin-apps'], '/api/admin/apps', { cookie: c }, {})).b.apps.length, 0);
});
await t('robots.txt and sitemap.xml use the request origin and hide admin/api', async () => {
  const rb = await m.seo(new Request('https://my.example/robots.txt')); const txt = await rb.text();
  assert.match(rb.headers.get('content-type'), /text\/plain/); assert.ok(txt.includes('Disallow: /admin-panel/') && txt.includes('Disallow: /api/'));
  assert.ok(txt.includes('Sitemap: https://my.example/sitemap.xml'));
  const sm = await m.seo(new Request('https://my.example/sitemap.xml')); const xml = await sm.text();
  assert.match(sm.headers.get('content-type'), /xml/); assert.equal((xml.match(/<loc>/g) || []).length, 5);
  assert.ok(xml.includes('<loc>https://my.example/about.html</loc>') && !xml.includes('admin') && !xml.includes('/api/') && !xml.includes('#'));
  assert.equal((await m.seo(new Request('https://my.example/robots.txt', { method: 'POST' }))).status, 405);
});
console.log(`\n${passed} passed`);
