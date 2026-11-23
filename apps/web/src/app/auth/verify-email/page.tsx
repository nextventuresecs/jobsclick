'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function VerifyEmailPage() {
  const t = useTranslations('VerifyEmail');
  const initialized = useRef(false);
  const [token, setToken] = useState<string | null>();
  const [status, setStatus] = useState<'ready' | 'sending' | 'verified' | 'failed'>('ready');

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const url = new URL(window.location.href);
    const value = url.searchParams.get('token');
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', url);
    setToken(value && /^[a-f\d]{64}$/i.test(value) ? value : null);
  }, []);

  async function verify() {
    if (!token || status !== 'ready') return;
    setStatus('sending');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error('API URL missing');
      const result = await fetch(`${apiUrl.replace(/\/+$/, '')}/auth/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setStatus(result.ok ? 'verified' : 'failed');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {token === null || status === 'failed' ? <p role="alert">{t('failed')}</p>
        : status === 'verified' ? <p role="status">{t('verified')}</p>
        : <button className="rounded-lg bg-slate-900 px-4 py-2 text-white" type="button"
            disabled={!token || status === 'sending'} onClick={verify}>
            {t(status === 'sending' ? 'verifying' : 'submit')}
          </button>}
      <Link href="/" className="block underline">{t('home')}</Link>
    </main>
  );
}
