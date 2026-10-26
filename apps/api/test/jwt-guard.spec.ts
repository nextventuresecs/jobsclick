import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';

describe('JwtAuthGuard Cryptographic Verification & Expiration (Issue #1)', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  const secret = 'jobsclick-jwt-secret-key-32-chars-min';

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
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
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const signature = crypto.createHmac('sha256', signingSecret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  it('accepts valid JWT signed with secret and sets request.user', () => {
    const token = signToken({
      sub: 'usr_verified_123',
      role: 'employer',
      phone: '9876543210',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const context = createMockContext({ authorization: `Bearer ${token}` });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('usr_verified_123');
    expect(req.user.role).toBe('employer');
  });

  it('rejects forged JWT with modified payload or invalid signature (Issue #1)', () => {
    // Attacker crafts admin payload with attacker's secret
    const forgedToken = signToken(
      { sub: 'usr_attacker', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
      'wrong-attacker-secret'
    );

    const context = createMockContext({ authorization: `Bearer ${forgedToken}` });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(/Invalid JWT signature/);
  });

  it('rejects tampered JWT where signature was computed for different payload', () => {
    const validToken = signToken({
      sub: 'usr_normal',
      role: 'job_seeker',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const [header, , signature] = validToken.split('.');
    // Tamper payload to escalate role to admin while keeping old signature
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'usr_normal', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    const context = createMockContext({ authorization: `Bearer ${tamperedToken}` });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(/Invalid JWT signature/);
  });

  it('rejects expired JWT token (Issue #1)', () => {
    const expiredToken = signToken({
      sub: 'usr_expired',
      role: 'employer',
      exp: Math.floor(Date.now() / 1000) - 60, // expired 60 seconds ago
    });

    const context = createMockContext({ authorization: `Bearer ${expiredToken}` });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(/JWT token has expired/);
  });

  it('rejects malformed token structure (not 3 segments)', () => {
    const malformedToken = 'just.two_segments';
    const context = createMockContext({ authorization: `Bearer ${malformedToken}` });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(/Invalid authorization token format/);
  });

  it('rejects token missing sub/id or role in payload', () => {
    const noSubToken = signToken({
      role: 'employer',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const context = createMockContext({ authorization: `Bearer ${noSubToken}` });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(/missing sub\/id/);
  });

  describe('STF-12: Zero Header Bypass Outside Test Mode', () => {
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

    it('rejects jwt_session_ mock tokens in development mode', () => {
      process.env['NODE_ENV'] = 'development';
      try {
        const context = createMockContext({ authorization: 'Bearer jwt_session_admin_1790000000' });
        expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });

    it('permits x-user-id header exclusively in test mode', () => {
      process.env['NODE_ENV'] = 'test';
      try {
        const context = createMockContext({ 'x-user-id': 'usr_test_123' });
        expect(guard.canActivate(context)).toBe(true);
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });
  });
});
