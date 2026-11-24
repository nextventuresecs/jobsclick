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
});
