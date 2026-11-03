import type { Observable } from 'rxjs';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ServiceUnavailableException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';
import { JwtService } from '../jwt.service.js';
import { OtpRedisService, UserAuthState } from '../otp-redis.service.js';
import { UserRepository } from '../../database/repositories/user.repository.js';

export const TEST_AUTH_GUARD = Symbol('TEST_AUTH_GUARD');

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Optional() @Inject(JwtService) private readonly jwtService: JwtService = new JwtService(),
    @Optional() @Inject(OtpRedisService) private readonly otpRedisService: OtpRedisService = new OtpRedisService(),
    @Optional() @Inject(UserRepository) private readonly userRepository?: UserRepository,
    @Optional() @Inject(TEST_AUTH_GUARD) private readonly testAuthGuard?: CanActivate,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    if (this.testAuthGuard) {
      return this.testAuthGuard.canActivate(context);
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || request.headers['Authorization'];

    // 1. Unauthenticated request on public route passes; on protected route fails
    if (!authHeader) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException('Authentication required');
    }

    // 2. Secret check (fail-closed before async hop if secret missing)
    const verificationSecret = process.env['JWT_SECRET'] ?? '';
    if (!verificationSecret || verificationSecret.length < 32) {
      throw new ServiceUnavailableException('Authentication service is not properly configured: JWT_SECRET missing');
    }

    // 3. Format validation
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization token format');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Authorization token cannot be empty');
    }

    // Execute async token and server state verification
    return this.verifyAndLoadState(request, token);
  }

  private async verifyAndLoadState(request: Record<string, unknown>, token: string): Promise<boolean> {
    // 1. Cryptographically verify token via jose JwtService
    const claims = await this.jwtService.verifyAccessToken(token);

    // 2. Load server-side state (Redis cluster with fallback to persistent database)
    const state = await this.loadUserState(claims.sub);

    // 3. Status enforcement: strictly require active
    if (state.status !== 'active') {
      throw new UnauthorizedException('User account is not active');
    }

    // 4. Token version equality: ensures instant revocation across instances on bump
    if (state.tokenVersion !== claims.tv) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // 5. Authoritative user context: role loaded STRICTLY from server state
    const user: AuthUser = {
      id: claims.sub,
      role: state.role,
    };

    request['user'] = user;
    return true;
  }

  private async loadUserState(userId: string): Promise<UserAuthState> {
    // Primary: Redis cache (fail-closed if Redis throws)
    try {
      const cached = await this.otpRedisService.getAuthState(userId);
      if (cached) {
        return cached;
      }
    } catch (err) {
      this.logger.error(`Redis failure during auth state lookup for ${userId}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication state service temporarily unavailable');
    }

    // Secondary: Persistent Database
    if (!this.userRepository) {
      throw new ServiceUnavailableException('Authentication database service unavailable');
    }

    let userRow;
    try {
      userRow = await this.userRepository.findById(userId);
    } catch (err) {
      this.logger.error(`Database failure during auth state lookup for ${userId}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication database temporarily unavailable');
    }

    if (!userRow) {
      throw new UnauthorizedException('User account not found');
    }

    const state: UserAuthState = {
      role: userRow.role,
      status: userRow.status,
      tokenVersion: userRow.token_version ?? 0,
    };

    // Refresh Redis cache with short TTL (300s)
    try {
      await this.otpRedisService.setAuthState(userId, state, 300);
    } catch (err) {
      this.logger.error(`Failed to cache auth state in Redis for ${userId}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication state service temporarily unavailable');
    }

    return state;
  }
}
