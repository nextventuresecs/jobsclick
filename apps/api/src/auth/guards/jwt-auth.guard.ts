import crypto from 'node:crypto';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private isTestMode = process.env['NODE_ENV'] === 'test' || process.env['NODE_ENV'] === 'development';

  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || request.headers['Authorization'];
    const testUserId = request.headers['x-user-id'];

    let user: AuthUser | null = null;

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      user = this.verifyToken(token);
    } else if (this.isTestMode && testUserId && typeof testUserId === 'string' && testUserId.trim()) {
      // Test-mode explicit user header support
      user = this.buildTestUser(testUserId.trim());
    }

    if (!user) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException('Authentication required');
    }

    request.user = user;
    return true;
  }

  private verifyToken(token: string): AuthUser {
    // 1. Session token pattern: only permitted in test / dev mode
    if (this.isTestMode && token.startsWith('jwt_session_')) {
      const parts = token.split('_');
      // jwt_session_<id...>_<timestamp>
      const userId = parts.slice(2, parts.length - 1).join('_');
      return this.buildTestUser(userId || 'usr_session');
    }

    // 2. JWT structure: header.payload.signature
    const segments = token.split('.');
    if (segments.length !== 3) {
      throw new UnauthorizedException('Invalid authorization token format');
    }

    const [headerB64, payloadB64, signature] = segments;
    if (!headerB64 || !payloadB64 || !signature) {
      throw new UnauthorizedException('Malformed JWT token segments');
    }

    // Cryptographic signature verification with timing-safe comparison
    const secret =
      process.env['JWT_SECRET'] ||
      process.env['SUPABASE_SECRET_KEY'] ||
      'jobsclick-jwt-secret-key-32-chars-min';

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid JWT signature');
    }

    let payload: {
      sub?: string;
      id?: string;
      role?: string;
      app_metadata?: { role?: string };
      exp?: number;
      phone?: string;
      email?: string | null;
    };

    try {
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch {
      throw new UnauthorizedException('Malformed JWT token payload');
    }

    // Expiration check
    if (typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > payload.exp) {
        throw new UnauthorizedException('JWT token has expired');
      }
    }

    const id = payload.sub || payload.id;
    if (!id || typeof id !== 'string') {
      throw new UnauthorizedException('Invalid JWT payload: missing sub/id');
    }

    const role =
      payload.app_metadata?.role ||
      payload.role ||
      (this.isTestMode ? (id.includes('employer') ? 'employer' : 'job_seeker') : null);

    if (!role || typeof role !== 'string') {
      throw new UnauthorizedException('Invalid JWT payload: missing role');
    }

    return {
      id,
      role: role as AuthUser['role'],
      phone: payload.phone,
      email: payload.email,
    };
  }

  private buildTestUser(userId: string): AuthUser {
    let role: AuthUser['role'] = 'job_seeker';
    if (userId.includes('emp') || userId.includes('bus')) {
      role = 'employer';
    } else if (userId.includes('inst')) {
      role = 'intermediary';
    } else if (userId.includes('admin')) {
      role = 'admin';
    }

    return {
      id: userId,
      role,
      phone: '9876543210',
      email: null,
    };
  }
}
