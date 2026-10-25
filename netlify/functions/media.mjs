import { mediaStore } from './_lib/store.mjs';
import { fail, wrap, methodNotAllowed } from './_lib/http.mjs';

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

export default wrap(async (req, context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET']);
  const key = context?.params?.key || '';
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(key) || key.includes('..')) return fail(404, 'Not found');
  const hit = await mediaStore().getWithMetadata(key, { type: 'stream' });
  if (!hit) return fail(404, 'Not found');
  const type = TYPES.has(hit.metadata?.contentType) ? hit.metadata.contentType : 'application/octet-stream';
  return new Response(hit.data, {
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=86400, s-maxage=86400',
      'x-content-type-options': 'nosniff',
      // An SVG opened directly must not be able to run script on our origin.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    }
  });
});
export const config = { path: '/api/media/:key' };
