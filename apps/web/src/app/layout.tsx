import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/noto-sans-devanagari/wght.css';
import './globals.css';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { headers } from 'next/headers';

import { ClientProviders } from '../components/ClientProviders';
import { getServerSession } from '../lib/auth-session';

export const dynamic = 'force-dynamic';

export const metadata = {
  metadataBase: new URL(process.env['NEXT_PUBLIC_APP_URL'] || 'https://jobsclick.live'),
  title: 'JobsClick — National Job Portal for MSMEs & Skilled Workforce',
  description: 'Connecting India’s Skilled Workforce with Verified Opportunities across MSMEs and Enterprises.',
  icons: {
    icon: '/favicon.ico', // Path relative to the public folder
  },
  alternates: {
    canonical: '/',
    languages: {
      'en': '/',
      'hi': '/hi',
      'x-default': '/',
    },
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const session = await getServerSession().catch(() => null);

  let cleanPath = '/';
  try {
    const headerList = headers();
    cleanPath = headerList.get('x-clean-path') || '/';
  } catch {
    // Headers unavailable in current rendering phase
  }

  const siteUrl = process.env['NEXT_PUBLIC_APP_URL'] || 'https://jobsclick.live';
  const canonicalPath = cleanPath === '/' ? '' : cleanPath;
  const enUrl = `${siteUrl}${canonicalPath || '/'}`;
  const hiUrl = `${siteUrl}/hi${canonicalPath}`;

  return (
    <html lang={locale}>
      <head>
        <link rel="alternate" hrefLang="en" href={enUrl} />
        <link rel="alternate" hrefLang="hi" href={hiUrl} />
        <link rel="alternate" hrefLang="x-default" href={enUrl} />
      </head>
      <body className="antialiased bg-[#F3F4F6] text-[#1F2937] min-h-screen flex flex-col font-sans">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ClientProviders initialSession={session}>{children}</ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
