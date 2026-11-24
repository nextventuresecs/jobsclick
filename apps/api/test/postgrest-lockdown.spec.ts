import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';

describe('PostgREST Direct Data Access Lockdown (Requirement 2)', () => {
  const SUPABASE_URL = process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321';
  const ANON_KEY =
    process.env['SUPABASE_ANON_KEY'] ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

  let authenticatedToken: string;

  beforeAll(async () => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    authenticatedToken = await new SignJWT({
      role: 'authenticated',
      aud: 'authenticated',
      sub: '00000000-0000-0000-0000-000000000001',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime('1h')
      .sign(secret);
  });

  const sendPostgrestRequest = async (
    token: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ) => {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await res.text();
    return {
      status: res.status,
      payload,
    };
  };

  describe('Direct PostgREST Access Denials via anon key', () => {
    it('denies SELECT on /rest/v1/users', async () => {
      const res = await sendPostgrestRequest(ANON_KEY, 'GET', '/rest/v1/users');
      // PostgREST returns 401 or 403 or 42501 permission denied
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies INSERT on /rest/v1/users', async () => {
      const res = await sendPostgrestRequest(ANON_KEY, 'POST', '/rest/v1/users', { phone: '9876543210' });
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies UPDATE on /rest/v1/users', async () => {
      const res = await sendPostgrestRequest(ANON_KEY, 'PATCH', '/rest/v1/users?id=eq.00000000-0000-0000-0000-000000000001', { phone: '9876543210' });
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies DELETE on /rest/v1/users', async () => {
      const res = await sendPostgrestRequest(ANON_KEY, 'DELETE', '/rest/v1/users?id=eq.00000000-0000-0000-0000-000000000001');
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies SELECT on /rest/v1/credit_ledgers', async () => {
      const res = await sendPostgrestRequest(ANON_KEY, 'GET', '/rest/v1/credit_ledgers');
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies INSERT on /rest/v1/credit_ledgers', async () => {
      const res = await sendPostgrestRequest(ANON_KEY, 'POST', '/rest/v1/credit_ledgers', {
        user_id: '00000000-0000-0000-0000-000000000001',
        amount: 100,
        reason: 'malicious_grant',
      });
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies UPDATE on /rest/v1/credit_ledgers', async () => {
      const res = await sendPostgrestRequest(ANON_KEY, 'PATCH', '/rest/v1/credit_ledgers?id=eq.00000000-0000-0000-0000-000000000001', { amount: 1000 });
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies DELETE on /rest/v1/credit_ledgers', async () => {
      const res = await sendPostgrestRequest(ANON_KEY, 'DELETE', '/rest/v1/credit_ledgers?id=eq.00000000-0000-0000-0000-000000000001');
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });
  });

  describe('Direct PostgREST Access Denials via authenticated JWT', () => {
    it('denies SELECT on /rest/v1/users', async () => {
      const res = await sendPostgrestRequest(authenticatedToken, 'GET', '/rest/v1/users');
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies INSERT on /rest/v1/users', async () => {
      const res = await sendPostgrestRequest(authenticatedToken, 'POST', '/rest/v1/users', { phone: '9876543210' });
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies UPDATE on /rest/v1/users', async () => {
      const res = await sendPostgrestRequest(authenticatedToken, 'PATCH', '/rest/v1/users?id=eq.00000000-0000-0000-0000-000000000001', { phone: '9876543210' });
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies DELETE on /rest/v1/users', async () => {
      const res = await sendPostgrestRequest(authenticatedToken, 'DELETE', '/rest/v1/users?id=eq.00000000-0000-0000-0000-000000000001');
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies SELECT on /rest/v1/credit_ledgers', async () => {
      const res = await sendPostgrestRequest(authenticatedToken, 'GET', '/rest/v1/credit_ledgers');
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies INSERT on /rest/v1/credit_ledgers', async () => {
      const res = await sendPostgrestRequest(authenticatedToken, 'POST', '/rest/v1/credit_ledgers', {
        user_id: '00000000-0000-0000-0000-000000000001',
        amount: 100,
        reason: 'malicious_grant',
      });
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies UPDATE on /rest/v1/credit_ledgers', async () => {
      const res = await sendPostgrestRequest(authenticatedToken, 'PATCH', '/rest/v1/credit_ledgers?id=eq.00000000-0000-0000-0000-000000000001', { amount: 1000 });
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });

    it('denies DELETE on /rest/v1/credit_ledgers', async () => {
      const res = await sendPostgrestRequest(authenticatedToken, 'DELETE', '/rest/v1/credit_ledgers?id=eq.00000000-0000-0000-0000-000000000001');
      expect([401, 403]).toContain(res.status);
      expect(res.payload).toMatch(/permission denied|42501|Unauthorized/i);
    });
  });
});
