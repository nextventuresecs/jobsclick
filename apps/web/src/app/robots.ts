import { MetadataRoute } from 'next';
import { getAppEnv } from '@indian-job-portal/validation';

export default function robots(): MetadataRoute.Robots {
  const appEnv = getAppEnv();
  if (appEnv === 'staging') {
    return { rules: { userAgent: '*', allow: '/' } };
  }

  if (appEnv !== 'production') {
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
