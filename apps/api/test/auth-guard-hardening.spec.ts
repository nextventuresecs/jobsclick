import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';

describe('JwtAuthGuard Hardening', () => {
  it('rejects x-user-id header and mock tokens without valid JWT signature', async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;

    const guard = new JwtAuthGuard(mockReflector);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-user-id': 'usr_attacker', authorization: 'Bearer jwt_session_forged' },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });
});
