import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { forwardBffRequest, validateCsrf } from '../src/lib/bff';
import { signSessionToken, verifyToken, SESSION_COOKIE_NAME } from '../src/lib/auth-session';
import { POST as uploadBulkRoster } from '../src/app/api/bulk/batches/file/route';

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
    it('forwards the authenticated roster as multipart with its original boundary', async () => {
      const token = createValidToken('institution-fixture', 'intermediary');
      const csv = 'Student Name,Phone\nCandidate,9876543210';
      const form = new FormData();
      form.set('source', 'Test Institution');
      form.set('entityType', 'student');
      form.set('file', new Blob([csv], { type: 'text/csv' }), 'roster.csv');
      const req = new NextRequest('http://localhost:3000/api/bulk/batches/file', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: form,
      });
      const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        const forwarded = new Request(url, init);
        expect(forwarded.url).toBe('http://localhost:3001/bulk/batches/file');
        expect(forwarded.headers.get('authorization')).toBe(`Bearer ${token}`);
        expect(forwarded.headers.get('content-type')).toBe(req.headers.get('content-type'));
        const received = await forwarded.formData();
        expect(received.get('source')).toBe('Test Institution');
        const file = received.get('file');
        expect(file).not.toBeNull();
        expect(typeof file).toBe('object');
        if (file && typeof file !== 'string') expect(await file.text()).toBe(csv);
        return Response.json({ id: 'batch-fixture' }, { status: 201 });
      });

      const response = await uploadBulkRoster(req);
      expect(response.status).toBe(201);
      expect(upstream).toHaveBeenCalledOnce();
    });

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

  it('supports JWT_PREVIOUS_SECRET rotation fallback in verifyToken while rejecting mismatched secrets', () => {
    const oldSecret = 'old-web-bff-rotation-secret-key-at-least-32-chars';
    const newSecret = 'new-web-bff-rotation-secret-key-at-least-32-chars';
    const origPrev = process.env.JWT_PREVIOUS_SECRET;

    try {
      process.env.JWT_SECRET = oldSecret;
      delete process.env.JWT_PREVIOUS_SECRET;
      const oldToken = createValidToken('usr_rotated_web', 'employer');

      process.env.JWT_SECRET = newSecret;
      process.env.JWT_PREVIOUS_SECRET = oldSecret;
      const verified = verifyToken(oldToken);
      expect(verified?.sub).toBe('usr_rotated_web');

      process.env.JWT_PREVIOUS_SECRET = 'unrelated-other-rotation-secret-key-at-least-32-ch';
      expect(verifyToken(oldToken)).toBeNull();
    } finally {
      if (origPrev === undefined) delete process.env.JWT_PREVIOUS_SECRET;
      else process.env.JWT_PREVIOUS_SECRET = origPrev;
    }
  });
});
