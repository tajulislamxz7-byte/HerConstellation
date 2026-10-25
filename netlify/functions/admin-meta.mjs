import { requireAdmin } from './_lib/auth.mjs';
import { getApps, getCategories, saveCategories, getSettings, saveSettings } from './_lib/store.mjs';
import { categoryList, settingsFields } from './_lib/validate.mjs';
import { json, fail, readJson, wrap, methodNotAllowed, NO_STORE } from './_lib/http.mjs';

export default wrap(async (req) => {
  requireAdmin(req);
  const which = new URL(req.url).pathname.split('/').pop(); // categories | settings
  if (!['GET', 'PUT'].includes(req.method)) return methodNotAllowed(['GET', 'PUT']);

  if (which === 'categories') {
    if (req.method === 'GET') return json({ categories: await getCategories() }, 200, NO_STORE);
    const next = categoryList((await readJson(req, 10_000))?.categories);
    const inUse = [...new Set((await getApps()).map((a) => a.category))].filter((c) => !next.includes(c));
    if (inUse.length) return fail(409, `Still used by apps: ${inUse.join(', ')}. Move or delete those apps first.`);
    await saveCategories(next);
    return json({ categories: next }, 200, NO_STORE);
  }
  if (which === 'settings') {
    if (req.method === 'GET') return json({ settings: await getSettings() }, 200, NO_STORE);
    const s = settingsFields(await readJson(req, 10_000));
    await saveSettings(s);
    return json({ settings: s }, 200, NO_STORE);
  }
  return fail(404, 'Not found');
});
export const config = { path: ['/api/admin/categories', '/api/admin/settings'] };
