import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export const locales = ['en', 'hi'] as const;
export const defaultLocale = 'en';

export default getRequestConfig(async () => {
  let headerLocale: string | null = null;
  let localeCookie: string | undefined;

  try {
    const headerStore = headers();
    headerLocale = headerStore.get('x-next-locale') || headerStore.get('x-locale');
  } catch {
    // Headers unavailable in current rendering phase
  }

  try {
    const cookieStore = cookies();
    localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  } catch {
    // Cookies unavailable in current rendering phase
  }

  // Header set by middleware rewrite takes precedence over cookie
  const rawLocale = headerLocale || localeCookie;
  const locale = (rawLocale && (locales as readonly string[]).includes(rawLocale))
    ? (rawLocale as (typeof locales)[number])
    : defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
