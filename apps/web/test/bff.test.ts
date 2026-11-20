import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { forwardBffRequest, validateCsrf } from '../src/lib/bff';
import { signSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth-session';

describe('BFF Helper (apps/web/src/lib/bff.ts)', () => {
  const originalFetch = global.fetch;
  const testSecret = 'jobsclick-jwt-test-secret-at-least-32-chars-length';

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
    process.env.INTERNAL_API_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  function createValidToken(userId = 'usr_test_123', role = 'employer') {
    return signSessionToken({
      sub: userId,
      role,
      status: 'active',
      jti: 'jti_test_123',
    });
  }

  describe('validateCsrf', () => {
    it('rejects cross-origin requests with mismatched Origin and Host headers', () => {
      const req = new NextRequest('http://localhost:3000/api/wallet/create-order', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'https://evil-attacker.com',
          'sec-fetch-site': 'cross-site',
        },
      });

      const result = validateCsrf(req);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects requests with sec-fetch-site: cross-site even if origin is missing', () => {
      const req = new NextRequest('http://localhost:3000/api/wallet/create-order', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'sec-fetch-site': 'cross-site',
        },
      });

      const result = validateCsrf(req);
      expect(result.valid).toBe(false);
    });

    it('accepts same-origin requests with matching Origin and Host', () => {
      const req = new NextRequest('http://localhost:3000/api/wallet/create-order', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'sec-fetch-site': 'same-origin',
        },
      });

      const result = validateCsrf(req);
      expect(result.valid).toBe(true);
    });

    it('allows GET requests without origin', () => {
      const req = new NextRequest('http://localhost:3000/api/wallet/balance', {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
        },
      });

      const result = validateCsrf(req);
      expect(result.valid).toBe(true);
    });
  });

  describe('forwardBffRequest', () => {
    it('returns 403 on cross-origin POST', async () => {
      const req = new NextRequest('http://localhost:3000/api/wallet/create-order', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'https://evil-attacker.com',
          'sec-fetch-site': 'cross-site',
        },
      });

      const res = await forwardBffRequest(req, '/wallet/recharge/create-order');
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('returns 401 when no session cookie is provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/wallet/balance', {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
        },
      });

      const res = await forwardBffRequest(req, '/wallet/balance');
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when session token is invalid or expired', async () => {
      const req = new NextRequest('http://localhost:3000/api/wallet/balance', {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=invalid.jwt.token`,
        },
      });

      const res = await forwardBffRequest(req, '/wallet/balance');
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('forwards valid request with Authorization: Bearer <token> and returns response', async () => {
      const token = createValidToken('usr_employer_456', 'employer');

      let capturedUrl = '';
      let capturedHeaders: HeadersInit | undefined;

      global.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;

        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ balance: 150, currency: 'INR' }),
          text: async () => JSON.stringify({ balance: 150, currency: 'INR' }),
        };
      });

      const req = new NextRequest('http://localhost:3000/api/wallet/balance', {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const res = await forwardBffRequest(req, '/wallet/balance');
      expect(res.status).toBe(200);

      // Verify upstream call
      expect(capturedUrl).toBe('http://localhost:3001/wallet/balance');
      const headers = new Headers(capturedHeaders);
      expect(headers.get('authorization')).toBe(`Bearer ${token}`);

      const json = await res.json();
      expect(json.balance).toBe(150);

      // Verify bearer token is NOT leaked in response body or Set-Cookie
      const resText = JSON.stringify(json);
      expect(resText).not.toContain(token);
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('maps upstream 500 error to generic code without leaking internal exception message or stack trace', async () => {
      const token = createValidToken('usr_employer_456', 'employer');

      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 500,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            statusCode: 500,
            message: 'Internal query failure: relation "credit_ledger" does not exist at /src/db.ts:42',
            stack: 'Error at /src/db.ts:42:15',
          }),
          text: async () => JSON.stringify({
            statusCode: 500,
            message: 'Internal query failure: relation "credit_ledger" does not exist at /src/db.ts:42',
          }),
        };
      });

      const req = new NextRequest('http://localhost:3000/api/wallet/balance', {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const res = await forwardBffRequest(req, '/wallet/balance');
      expect(res.status).toBe(500);
      const json = await res.json();

      expect(json.code).toBe('INTERNAL_SERVER_ERROR');
      expect(json.message).toBeUndefined();
      expect(json.stack).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain('relation "credit_ledger"');
    });

    it('maps upstream 404 or 409 error code cleanly', async () => {
      const token = createValidToken('usr_inst_1', 'intermediary');

      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 409,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            statusCode: 409,
            code: 'ACTIVE_SPONSORSHIP_EXISTS',
            message: 'Institution already has an active sponsorship grant until 2027-11-20',
          }),
          text: async () => JSON.stringify({
            statusCode: 409,
            code: 'ACTIVE_SPONSORSHIP_EXISTS',
          }),
        };
      });

      const req = new NextRequest('http://localhost:3000/api/institution/sponsorship/create-order', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'sec-fetch-site': 'same-origin',
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ studentCount: 500 }),
      });

      const res = await forwardBffRequest(req, '/institution/sponsorship/create-order');
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe('ACTIVE_SPONSORSHIP_EXISTS');
      // message is not echoed
      expect(json.message).toBeUndefined();
    });
  });

  describe('Content Security Policy (CSP) Headers', () => {
    it('defines CSP allowing Razorpay checkout scripts, frames, and telemetry without unsafe-inline scripts', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextConfigModule: any = await import('../next.config.js');
      const config = nextConfigModule.default || nextConfigModule;

      expect(typeof config?.headers).toBe('function');
      const headersList = await config.headers();
      const catchAll = headersList?.find((h: { source: string }) => h.source === '/(.*)');
      expect(catchAll).toBeDefined();

      const cspHeader = catchAll?.headers?.find(
        (h: { key: string; value: string }) => h.key === 'Content-Security-Policy'
      );
      expect(cspHeader).toBeDefined();

      const csp = cspHeader?.value || '';
      expect(csp).toContain('script-src');
      expect(csp).toContain('https://checkout.razorpay.com');
      expect(csp).toContain('frame-src');
      expect(csp).toContain('https://api.razorpay.com');
      expect(csp).toContain('https://checkout.razorpay.com');
      expect(csp).toContain('connect-src');
      expect(csp).toContain('https://lumberjack.razorpay.com');

      // Verify no unsafe-inline in script-src
      const scriptSrcDirective = csp
        .split(';')
        .find((d: string) => d.trim().startsWith('script-src'));
      expect(scriptSrcDirective).toBeDefined();
      expect(scriptSrcDirective).not.toContain("'unsafe-inline'");
    });
  });
});
