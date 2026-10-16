import './globals.css';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';

import { ClientProviders } from '../components/ClientProviders';
import { getServerSession } from '../lib/auth-session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'JobsClick — National Job Portal for MSMEs & Skilled Workforce',
  description: 'Connecting India’s Skilled Workforce with Verified Opportunities across MSMEs and Enterprises.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const session = await getServerSession().catch(() => null);

  return (
    <html lang={locale}>
      <body className="antialiased bg-[#F3F4F6] text-[#1F2937] min-h-screen flex flex-col font-sans">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ClientProviders initialSession={session}>{children}</ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
