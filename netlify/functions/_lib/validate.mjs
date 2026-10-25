// Input validation. Every function runs untrusted input through here before it is stored.
// Output safety: data is stored as plain text and served as JSON; the frontend only ever uses
// textContent / setAttribute, never innerHTML. Control characters are stripped on the way in.
import { randomBytes } from 'node:crypto';
import { httpError } from './http.mjs';

const bad = (msg) => httpError(400, msg);
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function text(v, field, { max, required = false, multiline = false } = {}) {
  if (v == null || v === '') { if (required) throw bad(`${field} is required`); return ''; }
  if (typeof v !== 'string') throw bad(`${field} must be text`);
  let s = v.replace(/\r\n?/g, '\n').replace(CTRL, '');
  if (!multiline) s = s.replace(/\n/g, ' ');
  s = s.trim();
  if (required && !s) throw bad(`${field} is required`);
  if (s.length > max) throw bad(`${field} must be at most ${max} characters`);
  return s;
}

export function url(v, field, { required = false } = {}) {
  const s = text(v, field, { max: 2048, required });
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { throw bad(`${field} must be a valid URL`); }
  // https only: the site's CSP blocks http images, and browsers warn on or block http downloads from an https page.
  if (u.protocol !== 'https:') throw bad(`${field} must start with https://`);
  if (u.username || u.password) throw bad(`${field} must not contain a username or password`);
  return u.href;
}

// An image is either a same-site media path or an https URL.
export function image(v, field) {
  if (typeof v === 'string' && v.startsWith('/api/media/')) {
    if (!/^\/api\/media\/[A-Za-z0-9._-]{1,100}$/.test(v)) throw bad(`${field} is not a valid media path`);
    return v;
  }
  return url(v, field);
}

export function date(v, field) {
  if (v == null || v === '') return '';
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v + 'T00:00:00Z'))) throw bad(`${field} must be a date like 2026-10-25`);
  return v;
}

export function stringList(v, field, { maxItems, maxLen }) {
  if (v == null) return [];
  if (!Array.isArray(v)) throw bad(`${field} must be a list`);
  if (v.length > maxItems) throw bad(`${field} can have at most ${maxItems} items`);
  return v.map((x, i) => text(x, `${field}[${i + 1}]`, { max: maxLen, required: true }));
}

export const newId = () => randomBytes(6).toString('hex');
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const today = () => new Date().toISOString().slice(0, 10);

// Validates the editable fields of an app. Server-controlled fields (id, dates, counts) are
// set by the caller, never trusted from the request.
export function appFields(b, categories) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('Body must be an object');
  const category = text(b.category, 'category', { max: 40, required: true });
  if (!categories.includes(category)) throw bad(`category must be one of: ${categories.join(', ')}`);
  const packageName = text(b.packageName, 'packageName', { max: 150 });
  if (packageName && !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) throw bad('packageName must look like com.example.app');
  const screenshots = stringList(b.screenshots, 'screenshots', { maxItems: 10, maxLen: 2048 }).map((u, i) => image(u, `screenshots[${i + 1}]`));
  return {
    name: text(b.name, 'name', { max: 80, required: true }),
    icon: image(b.icon, 'icon'),
    shortDescription: text(b.shortDescription, 'shortDescription', { max: 160 }),
    description: text(b.description, 'description', { max: 5000, multiline: true }),
    version: text(b.version, 'version', { max: 30 }),
    versionCode: text(b.versionCode, 'versionCode', { max: 12 }),
    category,
    fileSize: text(b.fileSize, 'fileSize', { max: 20 }),
    releaseDate: date(b.releaseDate, 'releaseDate'),
    changelog: text(b.changelog, 'changelog', { max: 3000, multiline: true }),
    minAndroid: text(b.minAndroid, 'minAndroid', { max: 10 }),
    packageName,
    developer: text(b.developer, 'developer', { max: 80 }),
    permissions: stringList(b.permissions, 'permissions', { maxItems: 30, maxLen: 60 }),
    screenshots,
    featured: b.featured === true,
    apkUrl: url(b.apkUrl, 'apkUrl'),
    published: b.published === true
  };
}

export function categoryList(v) {
  if (!Array.isArray(v)) throw bad('categories must be a list');
  if (v.length > 50) throw bad('At most 50 categories');
  const out = v.map((c, i) => text(c, `categories[${i + 1}]`, { max: 40, required: true }));
  if (new Set(out.map((c) => c.toLowerCase())).size !== out.length) throw bad('Category names must be unique');
  return out;
}

export function settingsFields(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('Body must be an object');
  const email = text(b.contactEmail, 'contactEmail', { max: 120 });
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw bad('contactEmail is not a valid email');
  return {
    siteName: text(b.siteName, 'siteName', { max: 60, required: true }),
    tagline: text(b.tagline, 'tagline', { max: 160 }),
    heroTitle: text(b.heroTitle, 'heroTitle', { max: 100 }),
    heroText: text(b.heroText, 'heroText', { max: 400 }),
    logo: image(b.logo, 'logo'),
    contactEmail: email
  };
}
