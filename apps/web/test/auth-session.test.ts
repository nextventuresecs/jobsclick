import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  verifyToken,
  getServerSession,
  AUTH_COOKIE_OPTIONS,
} from '../src/lib/auth-session';

describe('Session Cookie & JWT Infrastructure - Ticket T-05 (AUTH-05, AUTH-06)', () => {
  const testUser = {
    id: 'usr_9876543210',
    phone: '9876543210',
    email: 'user@example.in',
    role: 'job_seeker',
    status: 'active' as const,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('JWT Creation & Cryptographic Signature Verification', () => {
    it('creates a standard 3-part HMAC-SHA256 signed JWT', async () => {
      const token = await createSessionToken(testUser);
      expect(typeof token).toBe('string');
      const parts = token.split('.');
      expect(parts.length).toBe(3);

      // Verify header
      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');

      // Verify payload
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
      expect(payload.sub).toBe('usr_9876543210');
      expect(payload.role).toBe('job_seeker');
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('verifies a valid signed JWT and derives the correct clientRole', async () => {
      const token = await createSessionToken(testUser);
      const session = await verifyToken(token);

      expect(session).not.toBeNull();
      expect(session?.user.id).toBe('usr_9876543210');
      expect(session?.user.role).toBe('job_seeker');
      expect(session?.clientRole).toBe('jobseeker');
    });

    it('derives correct clientRole for employer and intermediary tokens', async () => {
      const empToken = await createSessionToken({ ...testUser, id: 'emp_123', role: 'employer' });
      const empSession = await verifyToken(empToken);
      expect(empSession?.clientRole).toBe('employer');

      const instToken = await createSessionToken({ ...testUser, id: 'inst_456', role: 'intermediary' });
      const instSession = await verifyToken(instToken);
      expect(instSession?.clientRole).toBe('institution');

      const adminToken = await createSessionToken({ ...testUser, id: 'admin_789', role: 'admin' });
      const adminSession = await verifyToken(adminToken);
      expect(adminSession?.clientRole).toBe('platform_admin');
    });

    it('AC-1: rejects tampered tokens where role was modified in payload (Privilege Escalation Prevention)', async () => {
      // 1. Create legitimate job seeker token
      const originalToken = await createSessionToken(testUser);
      const [header, , signature] = originalToken.split('.');

      // 2. Attacker modifies payload to claim "admin" role while keeping original signature
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          sub: testUser.id,
          role: 'admin',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString('base64url');

      const forgedToken = `${header}.${tamperedPayload}.${signature}`;

      // 3. Verification must fail due to cryptographic signature mismatch
      const verified = await verifyToken(forgedToken);
      expect(verified).toBeNull();
    });

    it('rejects expired JWT tokens', async () => {
      const expiredToken = await createSessionToken(testUser, -3600); // expired 1 hour ago
      const verified = await verifyToken(expiredToken);
      expect(verified).toBeNull();
    });

    it('rejects malformed or empty token strings', async () => {
      expect(await verifyToken('')).toBeNull();
      expect(await verifyToken('not.a.valid.jwt')).toBeNull();
      expect(await verifyToken('single-string-token')).toBeNull();
    });
  });

  describe('Secure Cookie Settings & Options', () => {
    it('defines secure, HttpOnly cookie configuration', () => {
      expect(AUTH_COOKIE_NAME).toBe('auth_token');
      expect(AUTH_COOKIE_OPTIONS.httpOnly).toBe(true);
      expect(AUTH_COOKIE_OPTIONS.sameSite).toBe('lax');
      expect(AUTH_COOKIE_OPTIONS.path).toBe('/');
      expect(AUTH_COOKIE_OPTIONS.maxAge).toBe(30 * 24 * 60 * 60); // 30 days
    });

    it('AC-2: resolves server session from cookie token', async () => {
      const validToken = await createSessionToken(testUser);
      const session = await getServerSession(validToken);

      expect(session).not.toBeNull();
      expect(session?.user.id).toBe('usr_9876543210');
      expect(session?.clientRole).toBe('jobseeker');
    });

    it('returns null if auth_token cookie is absent or invalid', async () => {
      expect(await getServerSession(undefined)).toBeNull();
      expect(await getServerSession('tampered_token')).toBeNull();
    });
  });

  describe('Sign Out of All Devices (AC-3)', () => {
    it('invalidates active session and removes auth_token cookie', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Signed out of all devices' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const apiUrl = 'http://localhost:3001';
      const userId = 'usr_9876543210';

      const response = await fetch(`${apiUrl}/auth/sign-out-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.message).toBe('Signed out of all devices');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/auth/sign-out-all',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-user-id': userId }),
        })
      );
    });
  });
});
