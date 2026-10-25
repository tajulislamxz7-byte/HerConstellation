# Local browser test of the admin panel against dev/server.mjs (real functions, fake Blobs).
import sys
from playwright.sync_api import sync_playwright
B = 'http://localhost:8890'
fails = []
def check(name, cond):
    print(('ok   ' if cond else 'FAIL ') + name)
    if not cond: fails.append(name)
with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 390, 'height': 800})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.goto(B + '/admin-panel/')
    pg.wait_for_selector('text=Admin sign in')
    check('login screen shown when signed out', True)
    pg.fill('input[type=password]', 'wrong'); pg.click('button:has-text("Sign in")')
    pg.wait_for_selector('.a-err:has-text("Wrong password")'); check('wrong password shows error', True)
    pg.fill('input[type=password]', 'test-pass'); pg.click('button:has-text("Sign in")')
    pg.wait_for_selector('.a-tabs'); check('right password opens dashboard', True)
    check('empty state shown', pg.locator('.a-empty').count() == 1)
    # categories
    pg.click('role=tab[name="Categories"]'); pg.click('role=button[name="Add category"]')
    pg.locator('.a-cat input').last.fill('Music'); pg.click('text=Save categories')
    pg.wait_for_selector('#status:has-text("Categories saved")'); check('category added', True)
    # create app (draft)
    pg.click('role=tab[name="Apps"]'); pg.click('role=button[name="Add app"]')
    pg.click('text=Create app'); pg.wait_for_selector('#status.err'); check('missing name shows server error', 'name is required' in pg.inner_text('#status'))
    pg.fill('label:has-text("Name *") + input', '<b>Tune</b> Player')
    pg.select_option('select', 'Music')
    pg.fill('label:has-text("Version") + input >> nth=0', '1.4')
    pg.fill('label:has-text("APK download link") + input', 'javascript:alert(1)'); pg.click('text=Create app')
    pg.wait_for_selector('#status.err'); check('javascript: APK link rejected', 'apkUrl' in pg.inner_text('#status'))
    pg.fill('label:has-text("APK download link") + input', 'https://example.com/tune.apk')
    pg.fill('label:has-text("Permissions") + textarea', 'Storage\nNotifications')
    pg.click('text=Create app'); pg.wait_for_selector('.a-row')
    check('app listed as draft with literal HTML text', pg.locator('.a-name').inner_text() == '<b>Tune</b> Player' and pg.locator('.a-badge').inner_text() == 'Draft')
    check('no injected <b> element', pg.locator('.a-name b').count() == 0)
    pub = pg.request.get(B + '/api/apps').json(); check('draft not on public API', len(pub['apps']) == 0)
    pg.click('role=button[name="Publish"]'); pg.wait_for_selector('.a-badge.live')
    pub = pg.request.get(B + '/api/apps').json(); check('published app on public API without apkUrl', len(pub['apps']) == 1 and 'apkUrl' not in pub['apps'][0] and pub['apps'][0]['canDownload'])
    # public site renders it
    pub_pg = br.new_page(); pub_pg.goto(B + '/'); pub_pg.wait_for_selector('.card'); check('public site shows the app', 'Tune' in pub_pg.inner_text('main')); pub_pg.close()
    # edit
    pg.click('role=button[name="Edit"]'); pg.fill('label:has-text("Name *") + input', 'Tune Player 2'); pg.click('text=Save changes')
    pg.wait_for_selector('.a-name:has-text("Tune Player 2")'); check('edit saved', True)
    # search
    pg.fill('input[type=search]', 'zzz'); check('search filters list', pg.locator('.a-empty').inner_text() == 'No apps match.'); pg.fill('input[type=search]', '')
    # category in use cannot be removed
    pg.click('role=tab[name="Categories"]')
    pg.locator('.a-cat').filter(has=pg.locator('input[value=Music]')).get_by_text('Remove').click(); pg.click('text=Save categories')
    pg.wait_for_selector('#status.err'); check('used category removal blocked', 'Still used' in pg.inner_text('#status'))
    # settings
    pg.click('role=tab[name="Settings"]'); pg.fill('label:has-text("Site name") + input', 'My Apps'); pg.click('text=Save settings')
    pg.wait_for_selector('#status:has-text("Settings saved")'); check('public settings updated', pg.request.get(B + '/api/settings').json()['siteName'] == 'My Apps')
    # backup export
    pg.click('role=tab[name="Backup"]')
    with pg.expect_download() as d: pg.click('text=Download backup')
    path = d.value.path(); import json; data = json.load(open(path)); check('backup downloads with app and apkUrl', data['apps'][0]['apkUrl'].endswith('tune.apk'))
    # import needs confirmation box
    pg.set_input_files('input[type=file]', path); pg.click('text=Replace everything'); pg.wait_for_selector('#status.err'); check('import blocked without confirm box', 'confirmation' in pg.inner_text('#status'))
    pg.check('.a-check input'); pg.click('text=Replace everything'); pg.wait_for_selector('#status:has-text("Backup restored")'); check('import works', True)
    # delete
    pg.click('role=tab[name="Apps"]'); pg.once('dialog', lambda dlg: dlg.accept()); pg.click('role=button[name^="Delete"]')
    pg.wait_for_selector('.a-empty'); check('delete works', True)
    # session expiry: cookie disappears mid-edit -> login screen with a clear message
    pg.click('role=button[name="Add app"]'); pg.fill('label:has-text("Name *") + input', 'Late app')
    pg.context.clear_cookies(); pg.click('text=Create app'); pg.wait_for_selector('.a-login')
    check('expired session returns to login with message', 'session ended' in pg.inner_text('.a-err'))
    pg.screenshot(path='/tmp/admin-mobile.png')
    # logout path
    pg2 = br.new_page(); pg2.goto(B + '/admin-panel/'); pg2.fill('input[type=password]', 'test-pass'); pg2.click('button:has-text("Sign in")'); pg2.wait_for_selector('.a-tabs')
    pg2.click('text=Sign out'); pg2.wait_for_selector('text=Signed out.'); check('sign out returns to login', True)
    check('no JS or CSP errors in console', not errors)
    if errors: print(errors)
    br.close()
print('FAILED:', fails if fails else 'none'); sys.exit(1 if fails else 0)
