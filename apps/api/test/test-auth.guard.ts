import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator.js';
import type { AuthUser } from '../src/auth/decorators/current-user.decorator.js';

@Injectable()
export class TestAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const headers = request.headers || {};
    const authHeader = headers['authorization'] || headers['Authorization'];
    const testUserId = headers['x-user-id'];
    const testRole = headers['x-user-role'];

    let user: AuthUser | null = null;

    if (testUserId && typeof testUserId === 'string' && testUserId.trim()) {
      user = this.buildTestUser(testUserId.trim(), testRole as string | undefined);
    } else if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token.startsWith('jwt_session_')) {
        const parts = token.split('_');
        const userId = parts.slice(2, parts.length - 1).join('_');
        user = this.buildTestUser(userId || 'usr_session', testRole as string | undefined);
      } else {
        // Try parsing payload if JWT
        try {
          const segments = token.split('.');
          if (segments.length === 3 && segments[1]) {
            const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf-8'));
            const id = payload.sub || payload.id;
            if (id) {
              const role = payload.app_metadata?.role || payload.role || testRole;
              user = this.buildTestUser(id, role);
            }
          }
        } catch {
          // ignore parsing error in test guard
        }
      }
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

  private buildTestUser(userId: string, explicitRole?: string): AuthUser {
    let role: AuthUser['role'] = (explicitRole as AuthUser['role']) || 'job_seeker';
    if (!explicitRole) {
      if (userId.includes('emp') || userId.includes('bus')) {
        role = 'employer';
      } else if (userId.includes('inst')) {
        role = 'intermediary';
      } else if (userId.includes('admin')) {
        role = 'admin';
      }
    }

    return {
      id: userId,
      role,
      email: null,
    };
  }
}
