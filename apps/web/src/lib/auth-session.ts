import crypto from 'node:crypto';
import type { ClientRole } from '@indian-job-portal/validation';
import { toClientRole } from '@indian-job-portal/validation';

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-jc_session' : 'jc_session';

export const AUTH_COOKIE_NAME = SESSION_COOKIE_NAME;

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days
};

const JWT_ISSUER = 'jobsclick-api';
const JWT_AUDIENCE = 'jobsclick-web';

export interface VerifiedSessionPayload {
  readonly sub: string; // Strictly UUID from Postgres
  readonly role:
    | 'job_seeker'
    | 'employer'
    | 'institution_admin'
    | 'intermediary'
    | 'msme_admin'
    | 'platform_admin'
    | string;
  readonly status: 'active' | 'invited' | 'disabled' | 'suspended';
  readonly jti: string; // Session ID for server-side revocation
  readonly iat: number;
  readonly exp: number;
  readonly iss: string;
  readonly aud: string;
}

export interface VerifiedSession extends VerifiedSessionPayload {
  readonly user: {
    readonly id: string;
    readonly phone?: string;
    readonly email?: string | null;
    readonly role: string;
    readonly status: string;
  };
  readonly accessToken: string;
  readonly clientRole: ClientRole;
  readonly expiresAt?: number;
}

function getJwtSecret(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      'CRITICAL BOOT ERROR: JWT_SECRET environment variable must be set and at least 32 characters long.'
    );
  }
  return Buffer.from(secret, 'utf-8');
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(input: string): Buffer {
  let str = input.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4 !== 0) {
    str += '=';
  }
  return Buffer.from(str, 'base64');
}

/**
 * Signs a strict HS256 JWT with mandatory exp, iss, aud, and jti claims.
 * Supports both VerifiedSessionPayload shapes and user objects for test compatibility.
 */
export function signSessionToken(
  payloadOrUser:
    | Omit<VerifiedSessionPayload, 'iat' | 'exp' | 'iss' | 'aud'>
    | { id: string; phone?: string; email?: string | null; role: string; status?: VerifiedSessionPayload['status']; jti?: string },
  ttlSeconds = 60 * 60 * 24 * 7 // 7 days max
): string {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);

  const sub = 'sub' in payloadOrUser ? payloadOrUser.sub : payloadOrUser.id;
  const role = payloadOrUser.role as VerifiedSessionPayload['role'];
  const status = payloadOrUser.status || 'active';
  const jti = 'jti' in payloadOrUser && payloadOrUser.jti ? payloadOrUser.jti : crypto.randomUUID();

  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload: VerifiedSessionPayload = {
    sub,
    role,
    status,
    jti,
    iat: now,
    exp: now + ttlSeconds,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export const createSessionToken = signSessionToken;

/**
 * Strictly verifies an HS256 JWT.
 * Rejects any legacy `jwt_session_*` tokens, missing `exp`, wrong alg, or disabled users.
 */
export function verifyToken(token: string | undefined | null): VerifiedSession | null {
  if (!token || typeof token !== 'string') return null;

  // Hard reject legacy unsigned token format immediately
  if (token.startsWith('jwt_session_')) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  try {
    const secret = getJwtSecret();
    const headerJson = JSON.parse(base64UrlDecode(encodedHeader).toString('utf-8'));

    if (headerJson?.alg !== 'HS256' || headerJson?.typ !== 'JWT') {
      return null;
    }

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest();
    const actualSig = base64UrlDecode(encodedSignature);

    if (
      expectedSig.length !== actualSig.length ||
      !crypto.timingSafeEqual(expectedSig, actualSig)
    ) {
      return null;
    }

    const payload = JSON.parse(
      base64UrlDecode(encodedPayload).toString('utf-8')
    ) as Partial<VerifiedSessionPayload>;

    const now = Math.floor(Date.now() / 1000);

    // Require exp, iss, aud, sub, jti, role
    if (
      typeof payload.exp !== 'number' ||
      payload.exp <= now ||
      payload.iss !== JWT_ISSUER ||
      payload.aud !== JWT_AUDIENCE ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.jti !== 'string' ||
      !payload.role
    ) {
      return null;
    }

    // Block disabled or suspended users immediately
    if (payload.status !== 'active') {
      return null;
    }

    const rawRole = (payload.role as string) || 'job_seeker';
    const clientRole = toClientRole(rawRole);
    const sub = payload.sub;

    const verifiedSession: VerifiedSession = {
      sub,
      role: rawRole,
      status: payload.status,
      jti: payload.jti,
      iat: payload.iat ?? now,
      exp: payload.exp,
      iss: payload.iss,
      aud: payload.aud,
      user: {
        id: sub,
        role: rawRole,
        status: payload.status,
      },
      accessToken: token,
      clientRole,
      expiresAt: payload.exp,
    };

    return verifiedSession;
  } catch {
    return null;
  }
}

/**
 * Resolves authenticated session on Next.js server components or from cookie strings.
 */
export async function getServerSession(
  tokenOrCookieHeader?: string
): Promise<VerifiedSession | null> {
  if (tokenOrCookieHeader) {
    if (tokenOrCookieHeader.includes('.')) {
      return verifyToken(tokenOrCookieHeader);
    }
    const match = tokenOrCookieHeader.match(
      new RegExp(`(?:^|;\\s*)(?:${SESSION_COOKIE_NAME}|${AUTH_COOKIE_NAME}|auth_token|jc_session)=([^;]+)`)
    );
    if (match && match[1]) {
      return verifyToken(match[1]);
    }
  }

  try {
    // @ts-expect-error next/headers type resolution in NodeNext
    const { cookies } = await import('next/headers');
    const cookieStore = cookies();
    const token =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ||
      cookieStore.get('auth_token')?.value ||
      cookieStore.get('jc_session')?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}
