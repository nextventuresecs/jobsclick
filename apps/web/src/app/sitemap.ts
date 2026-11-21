import { MetadataRoute } from 'next';
import { isProduction } from '@indian-job-portal/validation';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Staging and non-production environments must never be indexed or expose sitemap contents
  if (!isProduction()) {
    return [];
  }

  const baseUrl =
    process.env['NEXT_PUBLIC_APP_URL'] ||
    process.env['WEB_URL'] ||
    'https://jobsclick.live';
  const apiUrl =
    process.env['NEXT_PUBLIC_API_URL'] ||
    process.env['API_URL'] ||
    'http://localhost:3001';

  const sitemapEntries: MetadataRoute.Sitemap = [
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

  try {
    const res = await fetch(`${apiUrl}/jobs?limit=50`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as { jobs?: Array<{ slug?: string; updatedAt?: string }> };
      if (Array.isArray(data?.jobs)) {
        for (const job of data.jobs) {
          if (job.slug) {
            sitemapEntries.push({
              url: `${baseUrl}/jobs/${job.slug}`,
              lastModified: job.updatedAt ? new Date(job.updatedAt) : new Date(),
              changeFrequency: 'daily',
              priority: 0.8,
            });
          }
        }
      }
    }
  } catch {
    // Non-fatal fallback to static sitemap entries
  }

  return sitemapEntries;
}
