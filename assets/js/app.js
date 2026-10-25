/* Public homepage + app detail view (hash routed: #/app/<id>). */
(function () {
  'use strict';
  const { h, api, safeImg, iconEl, fmtDate, loadSettings, mountChrome } = Site;
  const main = document.getElementById('main');
  const state = { settings: null, apps: [], categories: [], q: '', cat: '', status: 'loading', lightbox: null };

  const svgSearch = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('aria-hidden', 'true');
    const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '7');
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', 'm20 20-3.5-3.5');
    s.append(c, p); return s;
  };

  const dlHref = (a) => '/api/download/' + encodeURIComponent(a.id);
  function dlButton(a, small) {
    const ok = a.canDownload !== false;
    return h('a', {
      class: 'btn btn-primary' + (small ? ' btn-sm' : ''),
      href: ok ? dlHref(a) : null, rel: 'noopener',
      'aria-disabled': ok ? null : 'true',
      text: ok ? 'Download APK' : 'Download unavailable'
    });
  }

  function tags(a) {
    return h('span', { class: 'tags' },
      a.category && h('span', { class: 'tag', text: a.category }),
      a.version && h('span', { class: 'tag', text: 'v' + a.version }),
      a.fileSize && h('span', { class: 'tag', text: a.fileSize }));
  }

  function cardMain(a, withTags) {
    return h('a', { class: 'card-main', href: '#/app/' + encodeURIComponent(a.id) },
      iconEl(a.icon, a.name, 'md'),
      h('span', { class: 'card-text' },
        h('span', { class: 'card-name', text: a.name }),
        h('span', { class: 'card-desc', text: a.shortDescription || '' }),
        withTags && tags(a)));
  }

  const card = (a) => h('article', { class: 'card' }, cardMain(a, true), dlButton(a));

  function featCard(a) {
    const el = h('article', { class: 'feat' }, h('span', { class: 'badge', text: 'Featured' }), cardMain(a, true), dlButton(a));
    const u = safeImg(a.icon);
    if (u) el.style.setProperty('--icon', 'url("' + u.replace(/["\\()\s]/g, encodeURIComponent) + '")');
    return el;
  }

  const stateful = (kind, title, text, action) =>
    h('div', { class: 'panel' + (kind === 'error' ? ' error' : ''), role: kind === 'error' ? 'alert' : 'status' },
      h('h3', { text: title }), h('p', { text }), action);

  function skeletons() {
    return h('div', { class: 'grid', 'aria-busy': 'true', 'aria-label': 'Loading apps' },
      [1, 2, 3, 4, 5, 6].map(() => h('div', { class: 'skel' })));
  }

  /* ---------- data ---------- */
  async function load() {
    state.status = 'loading'; route();
    try {
      const data = await api('/api/apps');
      state.apps = Array.isArray(data.apps) ? data.apps : [];
      const listed = Array.isArray(data.categories) ? data.categories : [];
      const used = new Set(state.apps.map((a) => a.category).filter(Boolean));
      state.categories = [...listed.filter((c) => used.has(c)), ...[...used].filter((c) => !listed.includes(c))];
      state.status = 'ready';
    } catch (e) {
      state.status = 'error';
    }
    route();
  }

  const stamp = (a) => a.updatedAt || a.releaseDate || '';
  const latestFirst = (x, y) => (stamp(y) > stamp(x) ? 1 : stamp(y) < stamp(x) ? -1 : x.name.localeCompare(y.name));

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return state.apps.filter((a) =>
      (!state.cat || a.category === state.cat) &&
      (!q || [a.name, a.shortDescription, a.category, a.packageName].some((v) => v && String(v).toLowerCase().includes(q)))
    ).sort(latestFirst);
  }

  /* ---------- home ---------- */
  let homeRefs = null;
  function renderHome() {
    document.title = state.settings.siteName + ' – ' + state.settings.tagline;
    if (!homeRefs || !main.contains(homeRefs.hero)) {
      const s = state.settings;
      const input = h('input', { type: 'search', id: 'q', placeholder: 'Search apps', autocomplete: 'off', 'aria-label': 'Search apps', value: state.q });
      let t;
      input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = input.value; updateResults(); }, 120); });
      const hero = h('section', { class: 'hero wrap' },
        h('h1', { text: s.heroTitle || s.tagline }),
        s.heroText && h('p', { text: s.heroText }),
        h('div', { class: 'search' }, svgSearch(), input));
      homeRefs = { hero, chips: h('div', { class: 'wrap' }), results: h('div', { class: 'wrap' }) };
      main.replaceChildren(hero, homeRefs.chips, homeRefs.results);
    }
    updateResults();
  }

  function updateResults() {
    const { chips, results } = homeRefs;
    if (state.status === 'loading') { chips.replaceChildren(); results.replaceChildren(h('div', { class: 'section' }, skeletons())); return; }
    if (state.status === 'error') {
      chips.replaceChildren();
      results.replaceChildren(h('div', { class: 'section' }, stateful('error', 'Could not load apps',
        'Check your connection and try again. If this keeps happening, the server may be unavailable.',
        h('button', { class: 'btn btn-primary', type: 'button', onclick: load, text: 'Try again' }))));
      return;
    }
    if (!state.apps.length) {
      chips.replaceChildren();
      results.replaceChildren(h('div', { class: 'section' }, stateful('empty', 'No apps yet', 'Nothing has been published yet. Check back soon.')));
      return;
    }
    if (state.cat && !state.categories.includes(state.cat)) state.cat = '';

    const mk = (label, value) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(state.cat === value),
      onclick: () => { state.cat = value; updateResults(); }, text: label });
    chips.replaceChildren(h('div', { class: 'chips', role: 'group', 'aria-label': 'Categories' },
      mk('All', ''), state.categories.map((c) => mk(c, c))));

    const list = filtered();
    const searching = state.q.trim() || state.cat;
    const feats = searching ? [] : state.apps.filter((a) => a.featured).sort(latestFirst);
    const parts = [];
    if (feats.length) {
      parts.push(h('section', { class: 'section', 'aria-labelledby': 'h-feat' },
        h('div', { class: 'section-head' }, h('h2', { id: 'h-feat', text: 'Featured' })),
        h('div', { class: 'strip' }, feats.map(featCard))));
    }
    const title = searching ? 'Results' : 'Latest apps';
    parts.push(h('section', { class: 'section', 'aria-labelledby': 'h-list' },
      h('div', { class: 'section-head' }, h('h2', { id: 'h-list', text: title }),
        h('span', { class: 'count', 'aria-live': 'polite', text: list.length + (list.length === 1 ? ' app' : ' apps') })),
      list.length ? h('div', { class: 'grid' }, list.map(card))
        : stateful('empty', 'No matching apps', 'Try a different search or category.',
            h('button', { class: 'btn', type: 'button', text: 'Clear filters', onclick: () => {
              state.q = ''; state.cat = ''; const i = document.getElementById('q'); if (i) i.value = ''; updateResults(); } }))));
    results.replaceChildren(...parts);
  }

  /* ---------- detail ---------- */
  function openShot(url) {
    if (!state.lightbox) {
      state.lightbox = h('dialog', { class: 'lightbox', 'aria-label': 'Screenshot' });
      state.lightbox.addEventListener('click', (e) => { if (e.target === state.lightbox) state.lightbox.close(); });
      document.body.append(state.lightbox);
    }
    state.lightbox.replaceChildren(
      h('button', { class: 'btn btn-sm', type: 'button', text: 'Close', onclick: () => state.lightbox.close() }),
      h('img', { src: url, alt: 'App screenshot enlarged' }));
    state.lightbox.showModal();
  }

  // Screenshots are external links, so any of them can be dead. A broken one is removed
  // rather than shown as a broken-image icon; if none load, the whole section goes away.
  function shotsSection(urls, appName) {
    const strip = h('div', { class: 'shots' });
    const section = h('section', { class: 'section', 'aria-label': 'Screenshots' }, strip);
    urls.forEach((u, i) => {
      const img = h('img', { src: u, alt: 'Screenshot ' + (i + 1) + ' of ' + appName, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      const btn = h('button', { class: 'shot', type: 'button', 'aria-label': 'View screenshot ' + (i + 1), onclick: () => openShot(u) }, img);
      img.addEventListener('error', () => { btn.remove(); if (!strip.children.length) section.remove(); });
      strip.append(btn);
    });
    return section;
  }

  function renderDetail(id) {
    homeRefs = null;
    const back = h('a', { class: 'back', href: '#/', text: '‹ All apps' });
    if (state.status === 'loading') { main.replaceChildren(h('div', { class: 'wrap' }, back, skeletons())); return; }
    if (state.status === 'error') {
      main.replaceChildren(h('div', { class: 'wrap section' }, back, stateful('error', 'Could not load this app', 'Check your connection and try again.',
        h('button', { class: 'btn btn-primary', type: 'button', onclick: load, text: 'Try again' }))));
      return;
    }
    const a = state.apps.find((x) => x.id === id);
    if (!a) {
      document.title = 'App not found – ' + state.settings.siteName;
      main.replaceChildren(h('div', { class: 'wrap section' }, back, stateful('empty', 'App not found', 'It may have been removed or is not published.',
        h('a', { class: 'btn btn-primary', href: '#/', text: 'Browse apps' }))));
      return;
    }
    document.title = a.name + ' – ' + state.settings.siteName;
    const shots = (a.screenshots || []).map(safeImg).filter(Boolean);
    const row = (k, v) => v ? h('div', {}, h('dt', { text: k }), h('dd', { text: String(v) })) : null;
    const dl = (typeof a.downloads === 'number' && a.downloads > 0) ? a.downloads.toLocaleString() + ' downloads' : '';

    main.replaceChildren(h('div', { class: 'wrap' },
      back,
      h('header', { class: 'd-head' },
        iconEl(a.icon, a.name, 'lg'),
        h('div', { class: 'd-title' },
          h('h1', { id: 'app-h1', tabindex: '-1', text: a.name }),
          h('div', { class: 'sub', text: [a.developer, a.category].filter(Boolean).join(' – ') }),
          tags(a)),
        h('div', { class: 'd-actions' }, dlButton(a), dl && h('small', { text: dl }))),
      shots.length ? shotsSection(shots, a.name) : null,
      (a.description || a.shortDescription) ? h('section', { class: 'section' }, h('h2', { text: 'About this app' }),
        h('p', { class: 'prose', text: a.description || a.shortDescription })) : null,
      a.changelog ? h('section', { class: 'section' }, h('h2', { text: 'What’s new' }), h('p', { class: 'prose', text: a.changelog })) : null,
      h('section', { class: 'section' }, h('h2', { text: 'Details' }),
        h('dl', { class: 'info' },
          row('Version', a.version), row('Version code', a.versionCode), row('File size', a.fileSize),
          row('Requires Android', a.minAndroid), row('Package', a.packageName),
          row('Released', fmtDate(a.releaseDate)), row('Last updated', fmtDate(a.updatedAt)))),
      (a.permissions && a.permissions.length) ? h('section', { class: 'section' }, h('h2', { text: 'Permissions' }),
        h('ul', { class: 'perms' }, a.permissions.map((p) => h('li', { text: p })))) : null,
      h('div', { class: 'sticky-dl' }, dlButton(a))));
    const h1 = document.getElementById('app-h1'); if (h1) h1.focus({ preventScroll: true });
  }

  /* ---------- router ---------- */
  let lastKey = '';
  function route() {
    const m = location.hash.match(/^#\/app\/([^/?#]+)/);
    const key = m ? 'app:' + m[1] : 'home';
    if (m) renderDetail(decodeURIComponent(m[1])); else renderHome();
    if (key !== lastKey) { window.scrollTo({ top: 0, behavior: 'instant' }); lastKey = key; }
  }

  (async function init() {
    state.settings = await loadSettings();
    mountChrome(state.settings);
    window.addEventListener('hashchange', route);
    load();
  })();
})();
