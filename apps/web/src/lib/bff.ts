import { NextRequest, NextResponse } from 'next/server';
import { isStrictEnv } from '@indian-job-portal/validation';
import { SESSION_COOKIE_NAME, verifyToken, type VerifiedSession } from './auth-session';

export interface CsrfValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * Validates CSRF for incoming requests to Next.js BFF route handlers.
 * Ensures Origin matches the request Host and Sec-Fetch-Site is same-origin or same-site.
 */
export function validateCsrf(req: NextRequest): CsrfValidationResult {
  const method = req.method.toUpperCase();

  // GET and HEAD do not mutate state and are safe from classic CSRF
  if (method === 'GET' || method === 'HEAD') {
    return { valid: true };
  }

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const origin = req.headers.get('origin');
  const secFetchSite = req.headers.get('sec-fetch-site');

  // If modern browser Sec-Fetch-Site is cross-site, reject immediately
  if (secFetchSite && secFetchSite === 'cross-site') {
    return { valid: false, error: 'CROSS_SITE_REQUEST_FORBIDDEN' };
  }

  // Validate Origin header when present
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (host && originHost !== host) {
        return { valid: false, error: 'ORIGIN_MISMATCH' };
      }
    } catch {
      return { valid: false, error: 'MALFORMED_ORIGIN' };
    }
  } else if (isStrictEnv()) {
    return { valid: false, error: 'MISSING_ORIGIN' };
  }

  return { valid: true };
}

/**
 * Extracts and decodes session token from HttpOnly cookie.
 */
export function extractSessionToken(req: NextRequest): string | null {
  // 1. NextRequest cookie store
  const cookieValue =
    req.cookies.get(SESSION_COOKIE_NAME)?.value ||
    req.cookies.get('__Host-jc_session')?.value ||
    req.cookies.get('jc_session')?.value;

  if (cookieValue) {
    return cookieValue;
  }

  // 2. Fallback to raw Cookie header parsing (e.g. In synthetic tests)
  const rawCookieHeader = req.headers.get('cookie');
  if (rawCookieHeader) {
    const match = rawCookieHeader.match(
      new RegExp(`(?:^|;\\s*)(?:${SESSION_COOKIE_NAME}|__Host-jc_session|jc_session|auth_token)=([^;]+)`)
    );
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

export interface ForwardBffOptions {
  readonly timeoutMs?: number;
  readonly multipart?: boolean;
}

/**
 * Server-side forwarding of Next.js Route Handler requests to upstream NestJS backend.
 * - Extracts and verifies session token server-side (token NEVER leaks to browser)
 * - Enforces CSRF check on mutating requests
 * - Injects Authorization: Bearer <token>
 * - Sets a strict 10s timeout
 * - Maps errors to clean { code } contracts without leaking raw internal exception strings
 */
export async function forwardBffRequest(
  req: NextRequest,
  apiPath: string,
  options?: ForwardBffOptions
): Promise<NextResponse> {
  // 1. CSRF Verification
  const csrf = validateCsrf(req);
  if (!csrf.valid) {
    return NextResponse.json(
      { error: 'CSRF_VALIDATION_FAILED', code: 'CSRF_VALIDATION_FAILED' },
      { status: 403 }
    );
  }

  // 2. Session extraction & verification
  const token = extractSessionToken(req);
  if (!token) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const session: VerifiedSession | null = verifyToken(token);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  // 3. Resolve upstream API URL
  const upstreamBase =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3001';

  // Build target URL, preserving any query parameters
  const sanitizedBase = upstreamBase.replace(/\/$/, '');
  const sanitizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const targetUrl = new URL(`${sanitizedBase}${sanitizedPath}`);

  // Forward search params from the incoming request if targetUrl doesn't already have them
  req.nextUrl.searchParams.forEach((value, key) => {
    if (!targetUrl.searchParams.has(key)) {
      targetUrl.searchParams.set(key, value);
    }
  });

  // 4. Setup timeout and upstream headers
  const timeoutMs = options?.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const upstreamHeaders = new Headers();
  upstreamHeaders.set('Authorization', `Bearer ${session.accessToken}`);
  upstreamHeaders.set('Accept', 'application/json');

  let bodyContent: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (options?.multipart) {
      const contentType = req.headers.get('content-type');
      if (!contentType || !/^multipart\/form-data;/i.test(contentType) || !req.body) {
        clearTimeout(timer);
        return NextResponse.json({ code: 'BULK_UPLOAD_INVALID' }, { status: 400 });
      }
      upstreamHeaders.set('Content-Type', contentType);
      bodyContent = req.body;
    } else {
      upstreamHeaders.set('Content-Type', 'application/json');
      try {
        bodyContent = await req.text();
      } catch {
        bodyContent = undefined;
      }
    }
  }

  try {
    const upstreamRequest: RequestInit & { duplex?: 'half' } = {
      method: req.method,
      headers: upstreamHeaders,
      body: bodyContent,
      signal: controller.signal,
    };
    if (options?.multipart) upstreamRequest.duplex = 'half';
    const upstreamRes = await fetch(targetUrl.toString(), upstreamRequest);

    clearTimeout(timer);

    const contentType = upstreamRes.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (upstreamRes.ok) {
      if (isJson) {
        const data = await upstreamRes.json();
        return NextResponse.json(data, {
          status: upstreamRes.status,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
      }
      const rawText = await upstreamRes.text();
      return new NextResponse(rawText, {
        status: upstreamRes.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    // Upstream returned non-2xx: map safely without echoing raw message or stack traces
    let code = 'UPSTREAM_ERROR';
    if (isJson) {
      const errJson = await upstreamRes.json().catch(() => ({}));
      if (typeof errJson?.code === 'string') {
        code = errJson.code;
      } else if (typeof errJson?.error === 'string') {
        code = errJson.error;
      } else if (upstreamRes.status === 400) {
        code = 'BAD_REQUEST';
      } else if (upstreamRes.status === 401) {
        code = 'UNAUTHORIZED';
      } else if (upstreamRes.status === 403) {
        code = 'FORBIDDEN';
      } else if (upstreamRes.status === 404) {
        code = 'NOT_FOUND';
      } else if (upstreamRes.status === 409) {
        code = 'CONFLICT';
      } else if (upstreamRes.status === 429) {
        code = 'RATE_LIMITED';
      } else if (upstreamRes.status >= 500) {
        code = 'INTERNAL_SERVER_ERROR';
      }
    } else {
      if (upstreamRes.status >= 500) {
        code = 'INTERNAL_SERVER_ERROR';
      }
    }

    return NextResponse.json(
      { error: code, code },
      {
        status: upstreamRes.status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (error) {
    clearTimeout(timer);
    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError');

    const status = isTimeout ? 504 : 500;
    const code = isTimeout ? 'GATEWAY_TIMEOUT' : 'INTERNAL_SERVER_ERROR';

    return NextResponse.json(
      { error: code, code },
      {
        status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
