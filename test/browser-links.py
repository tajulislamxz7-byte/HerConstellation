# Phase 5 local test: external-link flow (icons, screenshots, APK link) with dead and live links.
import sys, json
from playwright.sync_api import sync_playwright
B = 'http://localhost:8890'; fails = []
def check(n, c):
    print(('ok   ' if c else 'FAIL ') + n)
    if not c: fails.append(n)
SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#2a9d8f"/></svg>'
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 800}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    ctx.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/svg+xml', body=SVG))
    ctx.route('https://dead.test/**', lambda r: r.abort())
    r = pg.request.post(B + '/api/auth/login', data=json.dumps({'password': 'test-pass'}), headers={'content-type': 'application/json'}); check('api login', r.ok)
    def mk(**kw):
        d = dict(name='X', category='Tools', published=True, apkUrl='https://files.test/app.apk'); d.update(kw)
        x = pg.request.post(B + '/api/admin/apps', data=json.dumps(d), headers={'content-type': 'application/json'}); assert x.ok, x.text(); return x.json()['app']['id']
    mixed = mk(name='Mixed', icon='https://dead.test/i.png', screenshots=['https://dead.test/a.png', 'https://img.test/b.png', 'https://dead.test/c.png'])
    alldead = mk(name='AllDead', icon='https://img.test/i.png', screenshots=['https://dead.test/a.png', 'https://dead.test/b.png'])
    # public home: dead icon falls back to monogram
    pub = ctx.new_page(); pub.on('pageerror', lambda e: errs.append(str(e)))
    pub.goto(B + '/'); pub.wait_for_selector('.card'); pub.wait_for_timeout(800)
    card = pub.locator('.card', has_text='Mixed')
    check('dead icon shows monogram, no broken <img>', card.locator('.icon img').count() == 0 and card.locator('.icon').first.inner_text().strip() == 'M')
    check('live icon still shows image', pub.locator('.card', has_text='AllDead').locator('.icon img').count() == 1)
    # detail: dead screenshots removed, live one kept
    pub.goto(B + '/#/app/' + mixed); pub.wait_for_selector('h1'); pub.wait_for_timeout(800)
    check('only the working screenshot remains', pub.locator('.shot').count() == 1)
    pub.goto(B + '/#/app/' + alldead); pub.wait_for_selector('h1'); pub.wait_for_timeout(800)
    check('all-dead screenshots remove the section', pub.locator('[aria-label=Screenshots]').count() == 0)
    # download redirect
    d = pg.request.get(B + '/api/download/' + mixed, max_redirects=0); check('download 302 to external https APK', d.status == 302 and d.headers['location'] == 'https://files.test/app.apk')
    # admin hints and https enforcement
    pg.goto(B + '/admin-panel/'); pg.wait_for_selector('.a-tabs'); pg.click('role=button[name="Add app"]')
    apk = pg.locator('label:has-text("APK download link") + input')
    apk.fill('https://drive.google.com/file/d/abc123/view?usp=sharing'); check('Drive share link warned', pg.locator('.a-note').is_visible() and 'Google Drive' in pg.locator('.a-note').inner_text())
    apk.fill('https://www.dropbox.com/s/abc/app.apk?dl=0'); check('Dropbox dl=0 warned', 'dl=1' in pg.locator('.a-note').inner_text())
    apk.fill('http://files.test/app.apk'); check('http link warned live', 'https://' in pg.locator('.a-note').inner_text())
    pg.fill('label:has-text("Name *") + input', 'HttpApp'); pg.click('text=Create app'); pg.wait_for_selector('#status.err'); check('server rejects http link', 'https://' in pg.inner_text('#status'))
    apk.fill('https://files.test/app.apk'); check('good link clears warning', not pg.locator('.a-note').is_visible())
    check('no JS errors', not errs); 
    if errs: print(errs)
    br.close()
print('FAILED:', fails or 'none'); sys.exit(1 if fails else 0)
