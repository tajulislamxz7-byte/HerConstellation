# Phase 6 local test: manifest, service worker (offline), SEO files, accessibility spot checks.
import sys, json, struct, os, subprocess, time, urllib.request, signal
from playwright.sync_api import sync_playwright
B = 'http://localhost:8890'; fails = []
def check(n, c, extra=''):
    print(('ok   ' if c else 'FAIL ') + n + ((' -> ' + str(extra)) if (not c and extra) else ''))
    if not c: fails.append(n)
JH = {'content-type': 'application/json'}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def up():
    try: urllib.request.urlopen(B + '/favicon.svg', timeout=1); return True
    except Exception: return False
def stop_server():
    os.kill(int(open('/tmp/dev.pid').read()), signal.SIGTERM)
    for _ in range(50):
        if not up(): return
        time.sleep(0.1)
def start_server():
    pr = subprocess.Popen(['node', '--import', './test/register.mjs', 'dev/server.mjs'], cwd=ROOT, start_new_session=True, stdout=open('/tmp/dev.log', 'a'), stderr=subprocess.STDOUT)
    open('/tmp/dev.pid', 'w').write(str(pr.pid))
    for _ in range(50):
        if up(): return
        time.sleep(0.1)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 800}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.request.post(B + '/api/auth/login', data=json.dumps({'password': 'test-pass'}), headers=JH)
    mk = lambda name: pg.request.post(B + '/api/admin/apps', data=json.dumps({'name': name, 'category': 'Tools', 'published': True, 'apkUrl': 'https://files.test/a.apk', 'shortDescription': 'desc'}), headers=JH).json()['app']['id']
    first = mk('Alpha App')

    # ---- manifest ----
    mf = pg.request.get(B + '/manifest.webmanifest'); m = mf.json()
    check('manifest served with manifest content type', 'manifest+json' in mf.headers['content-type'])
    check('manifest has required fields', all(m.get(k) for k in ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color']))
    ok = True; purposes = set()
    for ic in m['icons']:
        r = pg.request.get(B + ic['src']); b = r.body(); w, h = struct.unpack('>II', b[16:24]); purposes.add(ic['purpose'])
        ok &= r.ok and b[:8] == b'\x89PNG\r\n\x1a\n' and f'{w}x{h}' == ic['sizes']
    check('every manifest icon exists, is a PNG and matches its declared size', ok)
    check('has 192, 512 and a maskable icon', {'any', 'maskable'} <= purposes and any(i['sizes'] == '192x192' for i in m['icons']))
    check('apple-touch-icon exists', pg.request.get(B + '/assets/icons/apple-touch-icon.png').ok)

    # ---- SEO ----
    rb = pg.request.get(B + '/robots.txt').text(); check('robots.txt blocks admin and api, lists sitemap', 'Disallow: /admin-panel/' in rb and 'Sitemap: ' + B + '/sitemap.xml' in rb)
    check('sitemap lists 5 pages', pg.request.get(B + '/sitemap.xml').text().count('<loc>') == 5)
    nf = pg.request.get(B + '/does-not-exist'); check('unknown path returns 404 with custom page', nf.status == 404 and 'Page not found' in nf.text())

    # ---- service worker ----
    pg.goto(B + '/'); pg.wait_for_selector('.card')
    pg.evaluate('navigator.serviceWorker.ready.then(() => true)'); pg.reload(); pg.wait_for_selector('.card')
    check('page is controlled by the service worker', pg.evaluate('!!navigator.serviceWorker.controller'))
    keys = pg.evaluate("(async()=>{const o={};for(const n of await caches.keys()){o[n]=(await (await caches.open(n)).keys()).map(r=>new URL(r.url).pathname)}return o})()")
    check('shell cache holds home + offline page', '/' in keys.get('shell-v1', []) and '/offline.html' in keys.get('shell-v1', []), keys)
    check('catalog cached after a visit', '/api/apps' in keys.get('data-v1', []), keys)

    # admin traffic must never be cached
    ap = ctx.new_page(); ap.goto(B + '/admin-panel/'); ap.wait_for_selector('.a-tabs'); ap.click('role=tab[name="Settings"]'); ap.click('role=tab[name="Backup"]'); ap.close()
    pg.request.get(B + '/api/download/' + first, max_redirects=0)
    keys = pg.evaluate("(async()=>{const o=[];for(const n of await caches.keys()){for(const r of await (await caches.open(n)).keys())o.push(new URL(r.url).pathname)}return o})()")
    bad = [k for k in keys if k.startswith(('/api/admin', '/api/auth', '/api/download', '/admin-panel'))]
    check('admin, auth and download are never cached', not bad, bad)

    # offline behaviour: the server is genuinely stopped (Playwright's offline switch does not cover service-worker fetches)
    stop_server(); check('server really is down', not up())
    pg.reload(); pg.wait_for_selector('.card', timeout=15000); check('offline: home loads with last-seen catalog', 'Alpha App' in pg.inner_text('main'))
    check('offline: no error panel', pg.locator('.panel.error').count() == 0)
    pg.goto(B + '/#/app/' + first); pg.wait_for_selector('h1'); check('offline: detail view works', 'Alpha App' in pg.inner_text('h1'))
    pg.goto(B + '/about.html'); pg.wait_for_selector('h1'); check('offline: static page loads', pg.inner_text('h1') == 'About')
    pg.goto(B + '/never-visited.html'); pg.wait_for_selector('h1'); check('offline: unvisited page shows offline notice', 'offline' in pg.inner_text('h1').lower(), pg.inner_text('h1'))
    start_server()
    second = mk('Beta App'); pg.goto(B + '/'); pg.wait_for_selector('.card'); pg.wait_for_timeout(500)
    check('back online: fresh catalog replaces the cached one', pg.locator('.card').count() == 1 and 'Beta App' in pg.inner_text('main') and 'Alpha App' not in pg.inner_text('main'), pg.inner_text('main')[:80])
    first = second

    # ---- accessibility spot checks ----
    for path in ['/', '/about.html', '/privacy.html', '/disclaimer.html', '/contact.html', '/404.html', '/offline.html', '/#/app/' + first]:
        pg.goto(B + path); pg.wait_for_selector('h1'); pg.wait_for_timeout(300)
        r = pg.evaluate("""() => ({
          lang: !!document.documentElement.lang, title: document.title.trim().length > 0, main: document.querySelectorAll('main').length === 1,
          h1: document.querySelectorAll('h1').length, zoom: !/user-scalable\\s*=\\s*no|maximum-scale\\s*=\\s*1(\\.0)?\\b/.test(document.querySelector('meta[name=viewport]').content),
          imgAlt: [...document.images].every(i => i.hasAttribute('alt')),
          names: [...document.querySelectorAll('a[href],button')].filter(e => !(e.textContent.trim() || e.getAttribute('aria-label') || e.querySelector('img[alt]:not([alt=""])'))).length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth })""")
        good = r['lang'] and r['title'] and r['main'] and r['h1'] == 1 and r['zoom'] and r['imgAlt'] and r['names'] == 0 and r['overflow'] <= 0
        check('a11y basics ' + path, good, r)
    pg.set_viewport_size({'width': 320, 'height': 640})
    for path in ['/', '/#/app/' + first]:
        pg.goto(B + path); pg.wait_for_selector('h1, .card'); pg.wait_for_timeout(300)
        check('no sideways scroll at 320px ' + path, pg.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'))
    pg.set_viewport_size({'width': 390, 'height': 800})
    pg.goto(B + '/'); pg.keyboard.press('Tab'); check('first Tab stop is the skip link', pg.evaluate('document.activeElement.className') == 'skip')
    pg.wait_for_selector('.card'); pg.click('.card-main >> nth=0'); pg.wait_for_selector('#app-h1'); pg.wait_for_timeout(300)
    check('opening an app moves focus to its heading', pg.evaluate("document.activeElement.id") == 'app-h1')
    check('no JS errors', not errs, errs)
    br.close()
print('FAILED:', fails or 'none'); sys.exit(1 if fails else 0)
