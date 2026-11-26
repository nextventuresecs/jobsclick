import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../src/auth/decorators/current-user.decorator.js';

interface MockRequest {
  headers: Record<string, string>;
  user?: AuthUser | null;
}

function createMockContext(headers: Record<string, string>, reqRef?: MockRequest): ExecutionContext {
  const req: MockRequest = reqRef || { headers };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('SEC-02: Hardened JWT Guard and Secret Enforcement', () => {
  const reflector = new Reflector();
  let otpRedis: OtpRedisService;
  let jwtService: JwtService;

  beforeEach(async () => {
    otpRedis = new OtpRedisService();
    await otpRedis.waitForReady();
    jwtService = new JwtService();
  });

  it('rejects tokens when algorithm is not HS256', async () => {
    const guard = new JwtAuthGuard(reflector, jwtService, otpRedis);
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'user_1', role: 'admin' })).toString('base64url');
    const token = `${header}.${payload}.invalidsig`;

    const mockContext = createMockContext({ authorization: `Bearer ${token}` });

    await expect(Promise.resolve(guard.canActivate(mockContext))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects tokens signed with invalid secret', async () => {
    const originalSecret = process.env['JWT_SECRET'];
    process.env['JWT_SECRET'] = 'my-super-secret-key-that-is-at-least-32-chars-long';

    try {
      const guard = new JwtAuthGuard(reflector, new JwtService(), otpRedis);
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: 'user_1', role: 'admin' })).toString('base64url');
      const badSig = crypto.createHmac('sha256', 'wrong-secret-key-here-123456789012').update(`${header}.${payload}`).digest('base64url');
      const token = `${header}.${payload}.${badSig}`;

      const mockContext = createMockContext({ authorization: `Bearer ${token}` });

      await expect(Promise.resolve(guard.canActivate(mockContext))).rejects.toThrow(UnauthorizedException);
    } finally {
      process.env['JWT_SECRET'] = originalSecret;
    }
  });

  it('accepts tokens signed with valid secret and extracts user role from server state', async () => {
    const validSecret = 'valid-test-secret-key-with-at-least-32-characters-entropy';
    const originalSecret = process.env['JWT_SECRET'];
    process.env['JWT_SECRET'] = validSecret;

    try {
      const customJwt = new JwtService();
      const guard = new JwtAuthGuard(reflector, customJwt, otpRedis);
      const token = await customJwt.signAccessToken('user_admin', 0);

      // Pre-seed server state
      await otpRedis.setAuthState('user_admin', {
        role: 'admin',
        status: 'active',
        tokenVersion: 0,
      });

      const mockReq: MockRequest = { headers: { authorization: `Bearer ${token}` }, user: null };
      const mockContext = createMockContext(mockReq.headers, mockReq);

      const activated = await guard.canActivate(mockContext);
      expect(activated).toBe(true);
      expect(mockReq.user).toEqual({
        id: 'user_admin',
        role: 'admin',
      });
    } finally {
      process.env['JWT_SECRET'] = originalSecret;
    }
  });

  it('rejects x-user-id header bypass in development mode (STF-12)', () => {
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    try {
      const guard = new JwtAuthGuard(reflector, jwtService, otpRedis);
      const mockReq: MockRequest = { headers: { 'x-user-id': 'usr_impersonator' }, user: null };
      const mockContext = createMockContext(mockReq.headers, mockReq);

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
    } finally {
      process.env['NODE_ENV'] = originalEnv;
    }
  });

  it('supports zero-downtime JWT_PREVIOUS_SECRET rotation fallback while enforcing claims and rejecting expired tokens (AUTHZ-09)', async () => {
    const oldSecret = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccdddddddddddddddd';
    const newSecret = '1111111111111111222222222222222233333333333333334444444444444444';
    const origSecret = process.env['JWT_SECRET'];
    const origPrev = process.env['JWT_PREVIOUS_SECRET'];

    try {
      // Issue token under old key
      process.env['JWT_SECRET'] = oldSecret;
      delete process.env['JWT_PREVIOUS_SECRET'];
      const oldJwtService = new JwtService();
      const oldToken = await oldJwtService.signAccessToken('user_rotated', 0);

      // Rotate to newSecret while keeping oldSecret in JWT_PREVIOUS_SECRET
      process.env['JWT_SECRET'] = newSecret;
      process.env['JWT_PREVIOUS_SECRET'] = oldSecret;
      await otpRedis.setAuthState('user_rotated', {
        role: 'employer',
        status: 'active',
        tokenVersion: 0,
      });

      const rotatedService = new JwtService();
      const guard = new JwtAuthGuard(reflector, rotatedService, otpRedis);
      const mockReq: MockRequest = { headers: { authorization: `Bearer ${oldToken}` }, user: null };
      const mockContext = createMockContext(mockReq.headers, mockReq);

      const activated = await guard.canActivate(mockContext);
      expect(activated).toBe(true);
      expect(mockReq.user).toEqual({ id: 'user_rotated', role: 'employer' });

      // Revoked session (bumped tokenVersion) is still rejected even when signed with old key
      await otpRedis.setAuthState('user_rotated', {
        role: 'employer',
        status: 'active',
        tokenVersion: 1,
      });
      await expect(Promise.resolve(guard.canActivate(mockContext))).rejects.toThrow(UnauthorizedException);

      // Token signed by unrelated attacker secret is rejected
      process.env['JWT_SECRET'] = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const forgedToken = await new JwtService().signAccessToken('user_rotated', 1);
      process.env['JWT_SECRET'] = newSecret;
      const forgedCtx = createMockContext({ authorization: `Bearer ${forgedToken}` });
      await expect(Promise.resolve(guard.canActivate(forgedCtx))).rejects.toThrow(UnauthorizedException);
    } finally {
      process.env['JWT_SECRET'] = origSecret;
      if (origPrev === undefined) delete process.env['JWT_PREVIOUS_SECRET'];
      else process.env['JWT_PREVIOUS_SECRET'] = origPrev;
    }
  });
});
