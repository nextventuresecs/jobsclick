import { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const env = (process.env['APP_ENV'] || process.env['NEXT_PUBLIC_APP_ENV'] || process.env['NODE_ENV'])?.trim().toLowerCase();
  if (env === 'staging') return [];
  const baseUrl = process.env['NEXT_PUBLIC_APP_URL'] || process.env['WEB_URL'] || 'http://localhost:3000';

  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/jobs`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ];
}
