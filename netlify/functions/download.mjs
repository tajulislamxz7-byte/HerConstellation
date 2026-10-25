import { getApps, bumpDownload } from './_lib/store.mjs';
import { fail, wrap, methodNotAllowed, NO_STORE } from './_lib/http.mjs';

export default wrap(async (req, context) => {
  if (!['GET', 'HEAD'].includes(req.method)) return methodNotAllowed(['GET', 'HEAD']);
  const app = (await getApps()).find((a) => a.id === context?.params?.id && a.published && a.apkUrl);
  if (!app) return fail(404, 'No download available for this app');
  if (req.method === 'GET') {
    // A counter failure must never block the download.
    try { await bumpDownload(app.id); } catch (e) { console.error('download count failed', e); }
  }
  return new Response(null, { status: 302, headers: { location: app.apkUrl, ...NO_STORE } });
});
export const config = { path: '/api/download/:id' };
