/* Static pages: fill header/footer and the contact details. */
(async function () {
  'use strict';
  const { h, loadSettings, mountChrome } = Site;
  const s = await loadSettings();
  mountChrome(s, document.body.dataset.title);
  document.querySelectorAll('[data-site-name]').forEach((el) => { el.textContent = s.siteName; });
  const slot = document.getElementById('contact-slot');
  if (slot) {
    const ok = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(s.contactEmail || '');
    slot.replaceChildren(ok
      ? h('p', {}, 'Email: ', h('a', { href: 'mailto:' + s.contactEmail, text: s.contactEmail }))
      : h('p', { text: 'Contact details have not been added yet. Please check back later.' }));
  }
})();
