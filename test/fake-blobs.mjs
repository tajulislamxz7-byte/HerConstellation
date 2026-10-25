// In-memory stand-in for @netlify/blobs. LOCAL TESTS ONLY: real Blobs behaviour is untested.
const stores = new Map();
export const reset = () => stores.clear();
export const state = { down: false };
export function getStore(opts) {
  const name = typeof opts === 'string' ? opts : opts.name;
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name);
  return {
    async get(k, o) { if (state.down) throw new Error('blobs down'); if (!m.has(k)) return null; const v = m.get(k); return o?.type === 'json' ? JSON.parse(v.data) : v.data; },
    async setJSON(k, v) { m.set(k, { data: JSON.stringify(v), metadata: {} }); },
    async set(k, v, o) { m.set(k, { data: v, metadata: o?.metadata || {} }); },
    async delete(k) { m.delete(k); },
    async getWithMetadata(k) { return m.has(k) ? { data: m.get(k).data, metadata: m.get(k).metadata } : null; }
  };
}
