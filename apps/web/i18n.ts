import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const locales = ['en', 'hi'] as const;
export const defaultLocale = 'en';

export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = (localeCookie && locales.includes(localeCookie as any))
    ? localeCookie
    : defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});

