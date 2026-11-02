import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';

describe('JwtAuthGuard Cryptographic Verification & Expiration (Issue #1)', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let otpRedis: OtpRedisService;
  let jwtService: JwtService;
  const secret = 'jobsclick-jwt-secret-key-32-chars-min';

  beforeEach(() => {
    process.env['JWT_SECRET'] = secret;
    reflector = new Reflector();
    otpRedis = new OtpRedisService();
    jwtService = new JwtService();
    guard = new JwtAuthGuard(reflector, jwtService, otpRedis);
  });

  function createMockContext(headers: Record<string, string>): ExecutionContext {
    const request = {
      headers,
      user: null as unknown,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  function signToken(payloadObj: Record<string, unknown>, signingSecret = secret): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const fullPayload = {
      iss: 'jobsclick-api',
      aud: 'jobsclick-web',
      tv: 0,
      jti: crypto.randomUUID(),
      ...payloadObj,
    };
    const payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = crypto.createHmac('sha256', signingSecret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  it('accepts valid JWT signed with secret and sets request.user', async () => {
    await otpRedis.setAuthState('usr_verified_123', {
      role: 'employer',
      status: 'active',
      tokenVersion: 0,
    });

    const token = signToken({
      sub: 'usr_verified_123',
      role: 'employer',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const context = createMockContext({ authorization: `Bearer ${token}` });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('usr_verified_123');
    expect(req.user.role).toBe('employer');
  });

  it('rejects forged JWT with modified payload or invalid signature (Issue #1)', async () => {
    const forgedToken = signToken(
      { sub: 'usr_attacker', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
      'wrong-attacker-secret-32-chars-long-x',
    );

    const context = createMockContext({ authorization: `Bearer ${forgedToken}` });
    await expect(Promise.resolve(guard.canActivate(context))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects tampered JWT where signature was computed for different payload', async () => {
    const validToken = signToken({
      sub: 'usr_normal',
      role: 'job_seeker',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const [header, , signature] = validToken.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        sub: 'usr_normal',
        role: 'admin',
        iss: 'jobsclick-api',
        aud: 'jobsclick-web',
        tv: 0,
        jti: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    const context = createMockContext({ authorization: `Bearer ${tamperedToken}` });
    await expect(Promise.resolve(guard.canActivate(context))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects expired JWT token (Issue #1)', async () => {
    const expiredToken = signToken({
      sub: 'usr_expired',
      role: 'employer',
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    const context = createMockContext({ authorization: `Bearer ${expiredToken}` });
    await expect(Promise.resolve(guard.canActivate(context))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed token structure (not 3 segments)', async () => {
    const malformedToken = 'just.two_segments';
    const context = createMockContext({ authorization: `Bearer ${malformedToken}` });
    await expect(Promise.resolve(guard.canActivate(context))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects token missing sub/id in payload', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'jobsclick-api',
        aud: 'jobsclick-web',
        tv: 0,
        jti: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }), // missing sub
    ).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    const noSubToken = `${header}.${payload}.${signature}`;

    const context = createMockContext({ authorization: `Bearer ${noSubToken}` });
    await expect(Promise.resolve(guard.canActivate(context))).rejects.toThrow(UnauthorizedException);
  });

  describe('STF-12 & Task 5: Zero Header Bypass Everywhere', () => {
    const originalEnv = process.env['NODE_ENV'];

    it('rejects x-user-id header in development mode (STF-12)', () => {
      process.env['NODE_ENV'] = 'development';
      try {
        const context = createMockContext({ 'x-user-id': 'usr_admin_bypass' });
        expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });

    it('rejects x-user-id header in production mode (STF-12)', () => {
      process.env['NODE_ENV'] = 'production';
      try {
        const context = createMockContext({ 'x-user-id': 'usr_admin_bypass' });
        expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });

    it('rejects jwt_session_ mock tokens in development mode', async () => {
      process.env['NODE_ENV'] = 'development';
      try {
        const context = createMockContext({ authorization: 'Bearer jwt_session_admin_1790000000' });
        await expect(Promise.resolve(guard.canActivate(context))).rejects.toThrow(UnauthorizedException);
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });

    it('rejects x-user-id header in test mode too (Task 5: Zero backdoors in production guard)', () => {
      process.env['NODE_ENV'] = 'test';
      try {
        const context = createMockContext({ 'x-user-id': 'usr_test_123' });
        expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });
  });
});
