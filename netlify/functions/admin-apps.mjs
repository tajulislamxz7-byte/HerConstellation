import { requireAdmin } from './_lib/auth.mjs';
import { getApps, saveApps, getCategories, getDownloads, saveDownloads } from './_lib/store.mjs';
import { appFields, newId, today } from './_lib/validate.mjs';
import { json, fail, readJson, wrap, methodNotAllowed, NO_STORE } from './_lib/http.mjs';

const MAX_APPS = 500;
const withCount = (a, d) => ({ ...a, downloads: Number(d[a.id]) || 0 });

export default wrap(async (req, context) => {
  requireAdmin(req);
  const id = context?.params?.id;
  const apps = await getApps();

  if (!id) {
    if (req.method === 'GET') {
      const d = await getDownloads();
      return json({ apps: apps.map((a) => withCount(a, d)), categories: await getCategories() }, 200, NO_STORE);
    }
    if (req.method === 'POST') {
      if (apps.length >= MAX_APPS) return fail(400, `Limit of ${MAX_APPS} apps reached`);
      const f = appFields(await readJson(req), await getCategories());
      const app = { id: newId(), ...f, releaseDate: f.releaseDate || today(), createdAt: today(), updatedAt: today() };
      await saveApps([app, ...apps]);
      return json({ app: withCount(app, {}) }, 201, NO_STORE);
    }
    return methodNotAllowed(['GET', 'POST']);
  }

  const i = apps.findIndex((a) => a.id === id);
  if (i < 0) return fail(404, 'App not found');

  if (req.method === 'GET') return json({ app: withCount(apps[i], await getDownloads()) }, 200, NO_STORE);

  if (req.method === 'PUT') {
    const f = appFields(await readJson(req), await getCategories());
    const app = { id, ...f, releaseDate: f.releaseDate || apps[i].releaseDate || today(), createdAt: apps[i].createdAt, updatedAt: today() };
    apps[i] = app;
    await saveApps(apps);
    return json({ app: withCount(app, await getDownloads()) }, 200, NO_STORE);
  }

  if (req.method === 'PATCH') { // publish / unpublish / feature without resending everything
    const b = await readJson(req, 1000);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return fail(400, 'Body must be an object');
    for (const k of ['published', 'featured']) {
      if (k in b) { if (typeof b[k] !== 'boolean') return fail(400, `${k} must be true or false`); apps[i][k] = b[k]; }
    }
    apps[i].updatedAt = today();
    await saveApps(apps);
    return json({ app: withCount(apps[i], await getDownloads()) }, 200, NO_STORE);
  }

  if (req.method === 'DELETE') {
    await saveApps(apps.filter((a) => a.id !== id));
    const d = await getDownloads();
    if (id in d) { delete d[id]; await saveDownloads(d); }
    return json({ ok: true }, 200, NO_STORE);
  }
  return methodNotAllowed(['GET', 'PUT', 'PATCH', 'DELETE']);
});
export const config = { path: ['/api/admin/apps', '/api/admin/apps/:id'] };
