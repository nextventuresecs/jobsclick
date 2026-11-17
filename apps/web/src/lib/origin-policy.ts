import type { NextRequest } from 'next/server';

export function validOrigin(req: NextRequest): boolean {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.WEB_URL;
  if (!configured && process.env.NODE_ENV === 'production') return false;
  try {
    return req.headers.get('origin') === new URL(configured || req.url).origin && req.headers.get('sec-fetch-site') !== 'cross-site';
  } catch { return false; }
}
