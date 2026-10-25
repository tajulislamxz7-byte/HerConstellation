// robots.txt and sitemap.xml are generated from the request's own origin, so they are correct
// on any domain without editing. Only crawlable pages are listed: app detail views live behind
// a #hash, which search engines do not index as separate pages.
import { methodNotAllowed } from './_lib/http.mjs';

const PAGES = ['/', '/about.html', '/privacy.html', '/disclaimer.html', '/contact.html'];
const CACHE = 'public, max-age=3600, s-maxage=3600';

export default async (req) => {
  if (!['GET', 'HEAD'].includes(req.method)) return methodNotAllowed(['GET', 'HEAD']);
  const origin = new URL(req.url).origin;
  if (new URL(req.url).pathname === '/robots.txt') {
    return new Response(`User-agent: *\nAllow: /\nDisallow: /admin-panel/\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`,
      { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': CACHE } });
  }
  const urls = PAGES.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': CACHE } });
};
export const config = { path: ['/robots.txt', '/sitemap.xml'] };
