import { requireAdmin } from './_lib/auth.mjs';
import { getApps, saveApps, getCategories, saveCategories, getSettings, saveSettings, getDownloads, saveDownloads } from './_lib/store.mjs';
import { appFields, categoryList, settingsFields, date, ID_RE } from './_lib/validate.mjs';
import { json, readJson, wrap, methodNotAllowed, NO_STORE, httpError } from './_lib/http.mjs';

const VERSION = 1;

export default wrap(async (req) => {
  requireAdmin(req);
  if (req.method === 'GET') {
    const [apps, categories, settings, downloads] = await Promise.all([getApps(), getCategories(), getSettings(), getDownloads()]);
    return json({ version: VERSION, exportedAt: new Date().toISOString(), apps, categories, settings, downloads }, 200,
      { ...NO_STORE, 'content-disposition': 'attachment; filename="catalog-backup.json"' });
  }
  if (req.method !== 'POST') return methodNotAllowed(['GET', 'POST']);

  // Import REPLACES the catalog. Everything is validated first; nothing is written if anything is wrong.
  const b = await readJson(req, 3_000_000);
  if (b?.replace !== true) throw httpError(400, 'Import replaces all data. Send "replace": true to confirm.');
  if (b.version !== VERSION) throw httpError(400, `Unsupported backup version (expected ${VERSION})`);
  if (!Array.isArray(b.apps) || b.apps.length > 500) throw httpError(400, 'apps must be a list of at most 500');

  const categories = categoryList(b.categories);
  const settings = settingsFields(b.settings);
  const seen = new Set();
  const apps = b.apps.map((raw, n) => {
    const where = `apps[${n + 1}]`;
    try {
      if (typeof raw?.id !== 'string' || !ID_RE.test(raw.id)) throw httpError(400, 'invalid id');
      if (seen.has(raw.id)) throw httpError(400, 'duplicate id');
      seen.add(raw.id);
      return { id: raw.id, ...appFields(raw, categories), createdAt: date(raw.createdAt, 'createdAt'), updatedAt: date(raw.updatedAt, 'updatedAt') };
    } catch (e) { if (e.status) e.message = `${where}: ${e.message}`; throw e; }
  });
  const downloads = {};
  for (const [id, n] of Object.entries(b.downloads && typeof b.downloads === 'object' ? b.downloads : {})) {
    if (seen.has(id) && Number.isFinite(n) && n >= 0) downloads[id] = Math.floor(n);
  }
  await saveCategories(categories); await saveSettings(settings); await saveApps(apps); await saveDownloads(downloads);
  return json({ ok: true, apps: apps.length }, 200, NO_STORE);
});
export const config = { path: '/api/admin/backup' };
