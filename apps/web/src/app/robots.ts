import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const env = (process.env['APP_ENV'] || process.env['NEXT_PUBLIC_APP_ENV'] || process.env['NODE_ENV'])?.trim().toLowerCase();
  if (env === 'staging') return { rules: { userAgent: '*', allow: '/' } };
  if (env && env !== 'production') return { rules: { userAgent: '*', disallow: '/' } };

  const baseUrl = process.env['NEXT_PUBLIC_APP_URL'] || process.env['WEB_URL'] || '';
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/workspace/', '/api/', '/monitoring/'] },
    ...(baseUrl ? { sitemap: `${baseUrl}/sitemap.xml` } : {}),
  };
}
