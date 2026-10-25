import { getApps, getCategories, getDownloads, publicApp } from './_lib/store.mjs';
import { json, fail, wrap, methodNotAllowed, PUBLIC_CACHE } from './_lib/http.mjs';

export default wrap(async (req, context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET']);
  const [apps, downloads] = await Promise.all([getApps(), getDownloads()]);
  const live = apps.filter((a) => a.published);
  const id = context?.params?.id;
  if (id) {
    const a = live.find((x) => x.id === id);
    return a ? json({ app: publicApp(a, downloads) }, 200, PUBLIC_CACHE) : fail(404, 'App not found');
  }
  return json({ apps: live.map((a) => publicApp(a, downloads)), categories: await getCategories() }, 200, PUBLIC_CACHE);
});
export const config = { path: ['/api/apps', '/api/apps/:id'] };
