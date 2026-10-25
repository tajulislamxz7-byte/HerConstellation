import { getSettings } from './_lib/store.mjs';
import { json, wrap, methodNotAllowed, PUBLIC_CACHE } from './_lib/http.mjs';

export default wrap(async (req) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET']);
  return json(await getSettings(), 200, PUBLIC_CACHE);
});
export const config = { path: '/api/settings' };
