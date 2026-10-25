// LOCAL DEV/TEST ONLY: serves the static site and runs the REAL Netlify functions against an
// in-memory fake of Blobs. Start with:  node --import ./test/register.mjs dev/server.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
process.env.ADMIN_PASSWORD ||= 'test-pass';
process.env.SESSION_SECRET ||= 'dev-secret-dev-secret-dev-secret-dev-secret';
const root = path.resolve(import.meta.dirname, '..');
const fdir = path.join(root, 'netlify/functions');
const routes = [];
for (const f of fs.readdirSync(fdir).filter((x) => x.endsWith('.mjs'))) {
  const mod = await import(path.join(fdir, f));
  for (const p of [].concat(mod.config.path)) routes.push({ parts: p.split('/').filter(Boolean), fn: mod.default });
}
function match(pathname) {
  const segs = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    const params = {}; let ok = true;
    for (let i = 0; i < r.parts.length && ok; i++) {
      const p = r.parts[i];
      if (p === '*') { params.splat = segs.slice(i).join('/'); if (segs.length < i + 1) ok = false; break; }
      if (segs[i] == null) ok = false;
      else if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
      else if (p !== segs[i]) ok = false;
      if (i === r.parts.length - 1 && segs.length > r.parts.length) ok = false;
    }
    if (ok) return { r, params };
  }
}
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://' + req.headers.host);
  const m = match(u.pathname); // real Netlify also routes non-/api paths (robots.txt, sitemap.xml) via config.path
  if (m) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    const out = await m.r.fn(new Request(u, { method: req.method, headers: req.headers, body }), { params: m.params, ip: '127.0.0.1' });
    const headers = {}; out.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
    const sc = out.headers.getSetCookie?.(); if (sc?.length) headers['set-cookie'] = sc;
    res.writeHead(out.status, headers); return res.end(Buffer.from(await out.arrayBuffer()));
  }
  if (u.pathname.startsWith('/api/')) { res.writeHead(404); return res.end('nf'); }
  let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(path.join(root, '404.html'))); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(8890, () => console.log('dev server on 8890'));
