import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';

export interface VerifiedClaims {
  sub: string;
  tv: number;
  jti: string;
  exp: number;
  [key: string]: unknown;
}

@Injectable()
export class JwtService {
  private getSecretKey(): Uint8Array {
    const secret = process.env['JWT_SECRET'] ?? '';
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('Authentication service is not properly configured: JWT_SECRET missing');
    }
    return new TextEncoder().encode(secret);
  }

  getTtlMinutes(): number {
    const raw = process.env['JWT_ACCESS_TOKEN_TTL_MINUTES'];
    const parsed = raw ? parseInt(raw, 10) : 30;
    if (isNaN(parsed) || parsed < 1) return 30;
    return Math.min(parsed, 60);
  }

  async signAccessToken(userId: string, tokenVersion: number, additionalClaims?: Record<string, unknown>): Promise<string> {
    const secretKey = this.getSecretKey();
    const ttlMinutes = this.getTtlMinutes();
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + ttlMinutes * 60;
    const jti = crypto.randomUUID();

    const builder = new SignJWT({
      tv: tokenVersion,
      ...additionalClaims,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer('jobsclick-api')
      .setAudience('jobsclick-web')
      .setJti(jti)
      .setIssuedAt(nowSec)
      .setExpirationTime(expSec);

    return builder.sign(secretKey);
  }

  async verifyAccessToken(token: string): Promise<VerifiedClaims> {
    const secretKey = this.getSecretKey();

    try {
      const { payload } = await jwtVerify(token, secretKey, {
        algorithms: ['HS256'],
        issuer: 'jobsclick-api',
        audience: 'jobsclick-web',
      });

      // Required claims: exp, sub, jti, tv
      if (typeof payload.exp !== 'number') {
        throw new UnauthorizedException('JWT token missing or invalid required claim: exp');
      }

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('JWT token missing or invalid required claim: sub');
      }

      if (!payload.jti || typeof payload.jti !== 'string') {
        throw new UnauthorizedException('JWT token missing or invalid required claim: jti');
      }

      if (typeof payload['tv'] !== 'number') {
        throw new UnauthorizedException('JWT token missing or invalid required claim: tv');
      }

      return {
        sub: payload.sub,
        tv: payload['tv'],
        jti: payload.jti,
        exp: payload.exp,
        ...payload,
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableException || err instanceof UnauthorizedException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Invalid token';
      throw new UnauthorizedException(`Invalid or expired authorization token: ${message}`);
    }
  }
}
