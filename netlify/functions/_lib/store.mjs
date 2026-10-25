// Storage layer over Netlify Blobs. Only plain JSON, one key per collection.
// A read error is NEVER treated as "empty": errors propagate so a Blobs outage cannot cause
// an admin write to overwrite real data with defaults.
import { getStore } from '@netlify/blobs';

const catalog = () => getStore({ name: 'catalog', consistency: 'strong' });
export const mediaStore = () => getStore({ name: 'media', consistency: 'strong' });
export const rateStore = () => getStore({ name: 'ratelimit', consistency: 'strong' });

export const DEFAULT_CATEGORIES = ['Apps', 'Games', 'Tools', 'Productivity'];
export const DEFAULT_SETTINGS = {
  siteName: 'App Library',
  tagline: 'Android apps with direct APK downloads.',
  heroTitle: '',
  heroText: '',
  logo: '',
  contactEmail: ''
};

async function read(key, fallback) {
  const v = await catalog().get(key, { type: 'json' });
  return v == null ? fallback : v;
}
const write = (key, value) => catalog().setJSON(key, value);

export const getApps = async () => { const v = await read('apps', []); return Array.isArray(v) ? v : []; };
export const saveApps = (apps) => write('apps', apps);

export const getCategories = async () => { const v = await read('categories', DEFAULT_CATEGORIES); return Array.isArray(v) ? v : DEFAULT_CATEGORIES; };
export const saveCategories = (c) => write('categories', c);

export const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await read('settings', {})) });
export const saveSettings = (s) => write('settings', s);

// Approximate download counts: read-modify-write, so simultaneous downloads can lose a count.
export const getDownloads = async () => { const v = await read('downloads', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
export const saveDownloads = (d) => write('downloads', d);
export async function bumpDownload(id) {
  const d = await getDownloads();
  d[id] = (Number(d[id]) || 0) + 1;
  await saveDownloads(d);
}

// What the public site may see. apkUrl is never exposed; only whether a link exists.
export function publicApp(a, downloads) {
  const { apkUrl, published, createdAt, ...rest } = a;
  return { ...rest, downloads: Number(downloads[a.id]) || 0, canDownload: !!apkUrl };
}
