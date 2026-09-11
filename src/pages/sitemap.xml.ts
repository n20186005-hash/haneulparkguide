import type { APIRoute } from 'astro';
import { languagesList } from '../i18n/ui';
import { attraction } from '../config/attraction';

const base = attraction.siteUrl;
const ROUTES = ['', 'privacy-policy', 'terms-of-service', 'cookie-settings'] as const;

export const GET: APIRoute = () => {
  const urls: string[] = [];

  for (const route of ROUTES) {
    for (const lang of languagesList) {
      const loc = route ? `${base}/${lang}/${route}` : `${base}/${lang}`;
      const priority = route === '' ? '1.0' : '0.5';
      const changefreq = route === '' ? 'weekly' : 'monthly';

      const alternates = languagesList
        .map((alt) => {
          const href = route ? `${base}/${alt}/${route}` : `${base}/${alt}`;
          return `    <xhtml:link rel="alternate" hreflang="${alt}" href="${href}" />`;
        })
        .join('\n');

      const xDefaultHref = route ? `${base}/ko/${route}` : `${base}/ko`;

      urls.push(
        [
          '  <url>',
          `    <loc>${loc}</loc>`,
          alternates,
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefaultHref}" />`,
          `    <changefreq>${changefreq}</changefreq>`,
          `    <priority>${priority}</priority>`,
          '  </url>',
        ].join('\n')
      );
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
