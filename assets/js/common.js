/* Shared helpers: safe DOM building, API calls, header/footer. No innerHTML anywhere. */
(function () {
  'use strict';
  const DEFAULTS = {
    siteName: 'App Library',
    tagline: 'Android apps with direct APK downloads.',
    heroTitle: '',
    heroText: '',
    logo: '',
    contactEmail: ''
  };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // Only same-site media or https images are ever placed in src.
  function safeImg(u) {
    if (typeof u !== 'string') return '';
    if (u.startsWith('/api/media/') || /^https:\/\//i.test(u)) return u;
    return '';
  }

  async function api(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(path, { headers: { accept: 'application/json' }, signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const monogram = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();

  function iconEl(src, name, size) {
    const wrap = h('span', { class: 'icon icon-' + (size || 'md'), 'aria-hidden': 'true' });
    const url = safeImg(src);
    if (url) {
      const img = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async', width: 96, height: 96, referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => { img.remove(); wrap.textContent = monogram(name); });
      wrap.append(img);
    } else {
      wrap.textContent = monogram(name);
    }
    return wrap;
  }

  function fmtDate(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
  }

  async function loadSettings() {
    try { return Object.assign({}, DEFAULTS, await api('/api/settings')); }
    catch (e) { return Object.assign({}, DEFAULTS, { settingsFailed: true }); }
  }

  function mountChrome(s, pageTitle) {
    const path = location.pathname.replace(/\/index\.html$/, '/');
    const link = (href, text) => h('a', { href, 'aria-current': path === href ? 'page' : null, text });
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');
    if (header) {
      header.className = 'topbar';
      header.replaceChildren(h('div', { class: 'wrap' },
        h('a', { class: 'brand', href: '/' }, iconEl(s.logo, s.siteName, 'sm'), h('span', { text: s.siteName })),
        h('nav', { class: 'nav', 'aria-label': 'Main' }, link('/', 'Apps'), link('/about.html', 'About'))
      ));
    }
    if (footer) {
      footer.className = 'footer';
      footer.replaceChildren(h('div', { class: 'wrap' },
        h('div', { class: 'links' },
          link('/about.html', 'About'), link('/privacy.html', 'Privacy policy'),
          link('/disclaimer.html', 'Disclaimer'), link('/contact.html', 'Contact')),
        h('p', { text: s.tagline }),
        h('p', { text: '© ' + new Date().getFullYear() + ' ' + s.siteName + '. Apps belong to their respective developers.' })
      ));
    }
    if (pageTitle) document.title = pageTitle + ' – ' + s.siteName;
  }

  window.Site = { h, api, safeImg, iconEl, fmtDate, monogram, loadSettings, mountChrome };
})();
