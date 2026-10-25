/* Admin panel. Plain JS, no innerHTML: everything is built with Site.h (textContent / setAttribute). */
(function () {
  'use strict';
  const { h, iconEl, fmtDate } = Site;
  const root = document.getElementById('app');
  const statusEl = document.getElementById('status');
  const state = { tab: 'apps', apps: [], categories: [], settings: {}, q: '', editing: null, catDraft: [] };
  let statusTimer;

  function say(msg, isErr) {
    clearTimeout(statusTimer);
    statusEl.className = 'a-status' + (isErr ? ' err' : '');
    statusEl.textContent = msg;
    statusTimer = setTimeout(() => { statusEl.textContent = ''; }, isErr ? 7000 : 3000);
  }

  class SessionEnded extends Error {}
  async function call(method, path, body) {
    const opt = { method, headers: { accept: 'application/json' } };
    if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const res = await fetch(path, opt);
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON body */ }
    if (res.status === 401 && !path.startsWith('/api/auth/')) { showLogin('Your session ended. Please sign in again.'); throw new SessionEnded(); }
    if (!res.ok) throw new Error((data && data.error) || 'Request failed (HTTP ' + res.status + ')');
    return data;
  }
  // Runs an action, shows any error as a message, and reports whether it worked.
  async function attempt(fn, okMsg) {
    try { const r = await fn(); if (okMsg) say(okMsg); return r === undefined ? true : r; }
    catch (e) { if (!(e instanceof SessionEnded)) say(e.message || 'Something went wrong', true); return false; }
  }

  function field(label, input, hint) {
    const id = 'f-' + Math.random().toString(36).slice(2, 8);
    input.id = id;
    return h('div', { class: 'a-field' }, h('label', { for: id, text: label }), input, hint ? h('span', { class: 'a-hint', text: hint }) : null);
  }
  const input = (type, value, extra) => h('input', Object.assign({ type, value: value || '', autocomplete: 'off' }, extra || {}));
  const area = (value, rows) => { const t = h('textarea', { rows: rows || 4 }); t.value = value || ''; return t; };
  const check = (label, checked) => {
    const c = h('input', { type: 'checkbox' }); c.checked = !!checked;
    return { el: h('label', { class: 'a-check' }, c, h('span', { text: label })), c };
  };
  const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  // ---------- login ----------
  function showLogin(msg, disabled) {
    const pw = input('password', '', { autocomplete: 'current-password', required: true });
    const err = h('p', { class: 'a-err', role: 'alert', text: msg || '' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Sign in' });
    const form = h('form', { class: 'a-form' }, field('Password', pw), btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); btn.disabled = true; err.textContent = '';
      try {
        await call('POST', '/api/auth/login', { password: pw.value });
        await boot();
      } catch (ex) { if (!(ex instanceof SessionEnded)) err.textContent = ex.message; pw.value = ''; btn.disabled = false; pw.focus(); }
    });
    root.replaceChildren(h('div', { class: 'a-login' }, h('h1', { text: 'Admin sign in' }),
      disabled ? h('p', { class: 'a-note', text: 'Login is disabled until ADMIN_PASSWORD and SESSION_SECRET (32+ characters) are set in the site’s environment variables.' }) : err,
      disabled ? null : form));
    if (!disabled) pw.focus();
  }

  // ---------- shell ----------
  const TABS = [['apps', 'Apps'], ['categories', 'Categories'], ['settings', 'Settings'], ['backup', 'Backup']];
  function render() {
    const tabs = h('div', { class: 'a-tabs', role: 'tablist' }, TABS.map(([k, label]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.tab === k), text: label,
        onclick: () => { state.tab = k; state.editing = null; if (k === 'categories') state.catDraft = state.categories.slice(); render(); } })));
    const body = state.tab === 'apps' ? (state.editing ? editorView() : appsView())
      : state.tab === 'categories' ? categoriesView() : state.tab === 'settings' ? settingsView() : backupView();
    root.replaceChildren(h('div', { class: 'a-wrap' },
      h('div', { class: 'a-top' }, h('h1', { text: 'Admin' }),
        h('span', { class: 'a-actions' }, h('a', { class: 'btn btn-sm', href: '/', target: '_blank', rel: 'noopener', text: 'View site' }),
          h('button', { class: 'btn btn-sm', type: 'button', text: 'Sign out', onclick: logout }))),
      tabs, body));
  }
  async function logout() {
    await attempt(() => call('POST', '/api/auth/logout', {}));
    showLogin('Signed out.');
  }

  // ---------- apps list ----------
  function appsView() {
    const list = h('div');
    const search = input('search', state.q, { placeholder: 'Search apps', 'aria-label': 'Search apps' });
    const paint = () => {
      const q = state.q.trim().toLowerCase();
      const shown = state.apps.filter((a) => !q || (a.name + ' ' + a.category + ' ' + (a.packageName || '')).toLowerCase().includes(q));
      list.replaceChildren(...(shown.length ? shown.map(appRow) : [h('p', { class: 'a-empty', text: state.apps.length ? 'No apps match.' : 'No apps yet. Add your first app.' })]));
    };
    search.addEventListener('input', () => { state.q = search.value; paint(); });
    paint();
    return h('div', null,
      h('div', { class: 'a-bar' }, search, h('button', { class: 'btn btn-primary', type: 'button', text: 'Add app', onclick: () => { state.editing = 'new'; render(); window.scrollTo(0, 0); } })),
      list);
  }
  function appRow(a) {
    return h('div', { class: 'a-row' }, iconEl(a.icon, a.name, 'md'),
      h('div', { class: 'a-main' },
        h('div', { class: 'a-name', text: a.name }),
        h('div', { class: 'a-meta' }, a.category, a.version ? ' · v' + a.version : '', ' · ', (a.downloads || 0) + ' downloads', a.apkUrl ? '' : ' · no APK link'),
        h('div', { class: 'a-meta' }, h('span', { class: 'a-badge' + (a.published ? ' live' : ''), text: a.published ? 'Published' : 'Draft' }), a.featured ? ' ★ Featured' : '', ' · updated ', fmtDate(a.updatedAt))),
      h('div', { class: 'a-actions' },
        h('button', { class: 'btn', type: 'button', text: 'Edit', onclick: () => { state.editing = a; render(); window.scrollTo(0, 0); } }),
        h('button', { class: 'btn', type: 'button', text: a.published ? 'Unpublish' : 'Publish', onclick: () => setPublished(a, !a.published) }),
        h('button', { class: 'btn a-danger', type: 'button', text: 'Delete', 'aria-label': 'Delete ' + a.name, onclick: () => removeApp(a) })));
  }
  async function setPublished(a, value) {
    if (await attempt(async () => { const r = await call('PATCH', '/api/admin/apps/' + encodeURIComponent(a.id), { published: value }); Object.assign(a, r.app); }, value ? 'Published' : 'Unpublished')) render();
  }
  async function removeApp(a) {
    if (!confirm('Delete “' + a.name + '” permanently? This cannot be undone.')) return;
    if (await attempt(async () => { await call('DELETE', '/api/admin/apps/' + encodeURIComponent(a.id)); state.apps = state.apps.filter((x) => x.id !== a.id); }, 'Deleted')) render();
  }

  // ---------- app editor ----------
  function editorView() {
    const isNew = state.editing === 'new';
    const a = isNew ? { published: false, category: state.categories[0] || '' } : state.editing;
    const f = {
      name: input('text', a.name, { required: true, maxlength: 80 }),
      icon: input('url', a.icon, { placeholder: 'https://…/icon.png' }),
      short: input('text', a.shortDescription, { maxlength: 160 }),
      desc: area(a.description, 6),
      version: input('text', a.version, { maxlength: 30 }),
      vcode: input('text', a.versionCode, { maxlength: 12 }),
      size: input('text', a.fileSize, { maxlength: 20, placeholder: '18 MB' }),
      min: input('text', a.minAndroid, { maxlength: 10, placeholder: '8.0' }),
      pkg: input('text', a.packageName, { maxlength: 150, placeholder: 'com.example.app' }),
      dev: input('text', a.developer, { maxlength: 80 }),
      date: input('date', a.releaseDate),
      apk: input('url', a.apkUrl, { placeholder: 'https://…/app.apk' }),
      change: area(a.changelog, 4),
      perms: area((a.permissions || []).join('\n'), 4),
      shots: area((a.screenshots || []).join('\n'), 4)
    };
    const cat = h('select', null, state.categories.map((c) => h('option', { value: c, text: c, selected: c === a.category })));
    const feat = check('Featured on the home page', a.featured);
    const pub = check('Published (visible on the site)', a.published);
    const warn = h('p', { class: 'a-note', role: 'status', hidden: true });
    const checkLink = () => {
      const v = f.apk.value.trim().toLowerCase();
      let msg = '';
      if (/drive\.google\.com\/file\/d\/.+\/(view|preview)/.test(v)) msg = 'This looks like a Google Drive share page, not a direct file link. Visitors would land on a Drive page instead of getting the APK.';
      else if (/dropbox\.com\/.*[?&]dl=0/.test(v)) msg = 'This Dropbox link opens a preview page. Change dl=0 to dl=1 for a direct download.';
      else if (v && !v.startsWith('https://')) msg = 'Links must start with https://.';
      warn.textContent = msg; warn.hidden = !msg;
    };
    f.apk.addEventListener('input', checkLink); checkLink();
    const iconPrev = h('div'); const paintIcon = () => iconPrev.replaceChildren(iconEl(f.icon.value.trim(), f.name.value, 'md'));
    f.icon.addEventListener('change', paintIcon); paintIcon();
    const save = h('button', { class: 'btn btn-primary', type: 'submit', text: isNew ? 'Create app' : 'Save changes' });
    const form = h('form', { class: 'a-form', novalidate: true },
      field('Name *', f.name), h('div', { class: 'a-field' }, h('span', { class: 'a-legend', text: 'Icon preview' }), iconPrev), field('Icon URL', f.icon, 'Direct https link to an image (png, jpg or webp). Square works best.'),
      field('Short description', f.short, 'Shown on the app card (max 160 characters).'), field('Description', f.desc),
      h('div', { class: 'a-grid2' }, field('Category *', cat), field('Developer', f.dev), field('Version', f.version), field('Version code', f.vcode),
        field('File size', f.size), field('Minimum Android', f.min), field('Package name', f.pkg), field('Release date', f.date, 'Leave empty to use today.')),
      field('APK download link', f.apk, 'Direct https link to the .apk file. Without it, the app shows “no download available”.'), warn,
      field('What’s new (changelog)', f.change), field('Permissions', f.perms, 'One per line.'), field('Screenshot URLs', f.shots, 'One https link per line, up to 10. Links that stop working are hidden on the site.'),
      feat.el, pub.el,
      h('div', { class: 'a-actions' }, h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => { state.editing = null; render(); } }), save));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { name: f.name.value, icon: f.icon.value, shortDescription: f.short.value, description: f.desc.value, version: f.version.value, versionCode: f.vcode.value,
        category: cat.value, fileSize: f.size.value, releaseDate: f.date.value, changelog: f.change.value, minAndroid: f.min.value, packageName: f.pkg.value,
        developer: f.dev.value, permissions: lines(f.perms.value), screenshots: lines(f.shots.value), featured: feat.c.checked, apkUrl: f.apk.value, published: pub.c.checked };
      save.disabled = true;
      const ok = await attempt(async () => {
        const r = isNew ? await call('POST', '/api/admin/apps', body) : await call('PUT', '/api/admin/apps/' + encodeURIComponent(a.id), body);
        state.apps = isNew ? [r.app, ...state.apps] : state.apps.map((x) => (x.id === r.app.id ? r.app : x));
        state.editing = null;
      }, isNew ? 'App created' : 'Saved');
      if (ok) render(); else save.disabled = false;
    });
    return h('div', null, h('h2', { text: isNew ? 'Add app' : 'Edit app' }), form);
  }

  // ---------- categories ----------
  function categoriesView() {
    const rows = h('div');
    const paint = () => rows.replaceChildren(...state.catDraft.map((c, i) => {
      const inp = input('text', c, { maxlength: 40, 'aria-label': 'Category name' });
      inp.addEventListener('input', () => { state.catDraft[i] = inp.value; });
      return h('div', { class: 'a-cat' }, inp, h('button', { class: 'btn a-danger', type: 'button', text: 'Remove', onclick: () => { state.catDraft.splice(i, 1); paint(); } }));
    }));
    paint();
    return h('div', null, h('div', { class: 'a-box' }, h('h2', { text: 'Categories' }),
      h('p', { class: 'a-hint', text: 'A category that apps still use cannot be removed or renamed. To rename one, add the new name, move the apps over, then remove the old name.' }), rows,
      h('div', { class: 'a-actions' },
        h('button', { class: 'btn', type: 'button', text: 'Add category', onclick: () => { state.catDraft.push(''); paint(); rows.lastChild && rows.lastChild.querySelector('input').focus(); } }),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Save categories', onclick: async () => {
          const next = state.catDraft.map((c) => c.trim()).filter(Boolean);
          if (await attempt(async () => { const r = await call('PUT', '/api/admin/categories', { categories: next }); state.categories = r.categories; state.catDraft = r.categories.slice(); }, 'Categories saved')) render();
        } }))));
  }

  // ---------- settings ----------
  function settingsView() {
    const s = state.settings;
    const f = { siteName: input('text', s.siteName, { maxlength: 60, required: true }), tagline: input('text', s.tagline, { maxlength: 160 }),
      heroTitle: input('text', s.heroTitle, { maxlength: 100 }), heroText: area(s.heroText, 3), logo: input('url', s.logo, { placeholder: 'https://…/logo.png' }),
      email: input('email', s.contactEmail, { maxlength: 120 }) };
    const save = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Save settings' });
    const form = h('form', { class: 'a-form', novalidate: true }, field('Site name *', f.siteName), field('Tagline', f.tagline, 'Shown in the footer.'),
      field('Home page title', f.heroTitle), field('Home page text', f.heroText), field('Logo URL', f.logo), field('Contact email', f.email, 'Shown on the Contact page.'), save);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); save.disabled = true;
      await attempt(async () => { const r = await call('PUT', '/api/admin/settings', { siteName: f.siteName.value, tagline: f.tagline.value, heroTitle: f.heroTitle.value, heroText: f.heroText.value, logo: f.logo.value, contactEmail: f.email.value }); state.settings = r.settings; }, 'Settings saved');
      save.disabled = false;
    });
    return h('div', { class: 'a-box' }, h('h2', { text: 'Site settings' }), form);
  }

  // ---------- backup ----------
  function backupView() {
    const file = h('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Backup file' });
    const confirmBox = check('I understand this replaces ALL apps, categories and settings', false);
    return h('div', null,
      h('div', { class: 'a-box' }, h('h2', { text: 'Export' }), h('p', { class: 'a-hint', text: 'Downloads every app (including drafts and APK links), categories, settings and download counts.' }),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Download backup', onclick: async () => {
          await attempt(async () => {
            const res = await fetch('/api/admin/backup', { headers: { accept: 'application/json' } });
            if (res.status === 401) { showLogin('Your session ended. Please sign in again.'); throw new SessionEnded(); }
            if (!res.ok) throw new Error('Export failed (HTTP ' + res.status + ')');
            const url = URL.createObjectURL(await res.blob());
            const link = h('a', { href: url, download: 'catalog-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
            document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
          }, 'Backup downloaded');
        } })),
      h('div', { class: 'a-box' }, h('h2', { text: 'Import' }), h('p', { class: 'a-hint', text: 'Restore from a backup file. Nothing changes if the file has any problem.' }),
        h('div', { class: 'a-form' }, file, confirmBox.el,
          h('button', { class: 'btn', type: 'button', text: 'Replace everything with this backup', onclick: async () => {
            if (!file.files[0]) return say('Choose a backup file first.', true);
            if (!confirmBox.c.checked) return say('Tick the confirmation box first.', true);
            if (file.files[0].size > 3_000_000) return say('That file is too large (3 MB max).', true);
            let data;
            try { data = JSON.parse(await file.files[0].text()); } catch (e) { return say('That file is not valid JSON.', true); }
            if (await attempt(async () => { await call('POST', '/api/admin/backup', Object.assign({}, data, { replace: true })); await loadAll(); }, 'Backup restored')) render();
          } }))));
  }

  // ---------- boot ----------
  async function loadAll() {
    const [a, s] = await Promise.all([call('GET', '/api/admin/apps'), call('GET', '/api/admin/settings')]);
    state.apps = a.apps; state.categories = a.categories; state.settings = s.settings; state.catDraft = a.categories.slice();
  }
  async function boot() {
    let sess;
    try { sess = await call('GET', '/api/auth/session'); } catch (e) { return showLogin('Could not reach the server: ' + e.message); }
    if (!sess.loginEnabled) return showLogin('', true);
    if (!sess.authenticated) return showLogin('');
    try { await loadAll(); state.tab = 'apps'; state.editing = null; render(); }
    catch (e) { if (!(e instanceof SessionEnded)) root.replaceChildren(h('div', { class: 'a-wrap' }, h('p', { class: 'a-err', text: 'Could not load data: ' + e.message }), h('button', { class: 'btn', type: 'button', text: 'Try again', onclick: boot }))); }
  }
  boot();
})();
