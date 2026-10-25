// Repo hygiene checks: things that must stay true for the site to stay safe.
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
let n = 0; const t = (name, fn) => { try { fn(); n++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n    ', e.message); process.exitCode = 1; } };

const clientJs = [...walk('assets/js'), ...walk('admin-panel'), 'sw.js'].filter((f) => f.endsWith('.js'));
t('no dangerous DOM/eval APIs in browser code', () => {
  for (const f of clientJs) for (const bad of [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML\(/, /document\.write\(/, /\beval\(/, /new Function\(/])
    assert.ok(!bad.test(read(f)), `${f} matches ${bad}`);
});
t('no inline scripts, inline handlers or inline styles in HTML (CSP)', () => {
  for (const f of walk('.').filter((x) => x.endsWith('.html') && !x.startsWith('node_modules'))) {
    const s = read(f);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(s), `${f}: inline <script>`);
    assert.ok(!/\son[a-z]+\s*=/i.test(s), `${f}: inline event handler`);
    assert.ok(!/\sstyle\s*=/i.test(s) && !/<style[\s>]/i.test(s), `${f}: inline style`);
  }
});
t('no secrets or default passwords in source', () => {
  for (const f of [...walk('netlify'), ...walk('admin-panel'), ...walk('assets/js'), 'sw.js', 'netlify.toml', 'package.json'])
    assert.ok(!/(password|secret)\s*[:=]\s*['"][^'"]{4,}['"]/i.test(read(f)), `${f} looks like it has a hard-coded secret`);
});
t('every function is a .mjs default export with a config.path', () => {
  for (const f of fs.readdirSync(path.join(root, 'netlify/functions')).filter((x) => x.endsWith('.mjs'))) {
    const s = read('netlify/functions/' + f);
    assert.match(s, /export default/, f); assert.match(s, /export const config = \{ path:/, f);
  }
});
t('every admin function calls requireAdmin first', () => {
  for (const f of ['admin-apps', 'admin-meta', 'admin-backup']) {
    const s = read(`netlify/functions/${f}.mjs`);
    assert.ok(/async \(req[^)]*\) => \{\s*requireAdmin\(req\);/.test(s), `${f} must call requireAdmin(req) as its first statement`);
  }
});
t('only @netlify/blobs is a dependency', () => {
  assert.deepEqual(Object.keys(JSON.parse(read('package.json')).dependencies), ['@netlify/blobs']);
});
t('netlify.toml keeps security headers and hides source files', () => {
  const s = read('netlify.toml');
  for (const h of ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Strict-Transport-Security', 'Referrer-Policy']) assert.ok(s.includes(h), h);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(s), 'CSP must not allow unsafe-inline/eval');
  for (const p of ['/netlify/*', '/test/*', '/dev/*', '/node_modules/*', '/package.json', '/netlify.toml', '/README.md']) assert.ok(s.includes(`from = "${p}"`), 'missing block for ' + p);
});
t('service worker never handles admin/auth/download', () => {
  const s = read('sw.js');
  assert.ok(s.includes("p.startsWith('/admin-panel')"));
  const allow = s.match(/if \(p === '\/api\/apps'[^)]*\)/)[0]; assert.ok(!/admin|auth|download/.test(allow), allow);
});
console.log(`${n} static checks passed`);
