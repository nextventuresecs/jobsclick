import { MetadataRoute } from 'next';
import { isProduction } from '@indian-job-portal/validation';

export default function robots(): MetadataRoute.Robots {
  if (!isProduction()) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  const baseUrl =
    process.env['NEXT_PUBLIC_APP_URL'] ||
    process.env['WEB_URL'] ||
    '';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/workspace/', '/api/', '/monitoring/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
