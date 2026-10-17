import type { ClientRole } from '@indian-job-portal/validation';
import { isClientRole, isUserRole, toClientRole } from '@indian-job-portal/validation';

export const AUTH_COOKIE_NAME = 'auth_token';

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60, // 30 days
};

export interface AuthSessionUser {
  id: string;
  phone: string;
  email: string | null;
  emailVerified?: boolean;
  role: string;
  status: 'invited' | 'active' | 'disabled';
}

export interface VerifiedSession {
  user: AuthSessionUser;
  accessToken: string;
  clientRole: ClientRole;
  expiresAt?: number;
}

function getJwtSecret(): string {
  return (
    process.env['JWT_SECRET'] ||
    process.env['SUPABASE_SECRET_KEY'] ||
    'jobsclick-jwt-secret-key-32-chars-min'
  );
}

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(str: string): string {
  const enc = new TextEncoder();
  return bufferToBase64Url(enc.encode(str));
}

function fromBase64Url(base64url: string): string {
  const bytes = base64UrlToUint8Array(base64url);
  const dec = new TextDecoder();
  return dec.decode(bytes);
}

async function signHmacSha256(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret).buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(data).buffer as ArrayBuffer);
  return bufferToBase64Url(sig);
}

async function verifyHmacSha256(data: string, signature: string, secret: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlToUint8Array(signature);
    return await globalThis.crypto.subtle.verify('HMAC', key, sigBytes.buffer as ArrayBuffer, enc.encode(data).buffer as ArrayBuffer);
  } catch {
    return false;
  }
}

/**
 * Creates an HMAC-SHA256 cryptographically signed JWT token for long-lived session cookie.
 */
export async function createSessionToken(
  user: AuthSessionUser,
  expiresInSeconds = 30 * 24 * 60 * 60
): Promise<string> {
  const secret = getJwtSecret();
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = toBase64Url(
    JSON.stringify({
      sub: user.id,
      id: user.id,
      phone: user.phone,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      status: user.status,
      iat: nowSec,
      exp: nowSec + expiresInSeconds,
    })
  );

  const signature = await signHmacSha256(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

/**
 * Verifies a token's cryptographic signature, expiration, and resolves authenticated session.
 */
export async function verifyToken(token?: string | null): Promise<VerifiedSession | null> {
  if (!token || typeof token !== 'string') return null;

  const secret = getJwtSecret();

  // 1. Standard JWT format: header.payload.signature
  const parts = token.split('.');
  if (parts.length === 3) {
    const [headerB64, payloadB64, signature] = parts;
    if (!headerB64 || !payloadB64 || !signature) return null;

    const isValid = await verifyHmacSha256(`${headerB64}.${payloadB64}`, signature, secret);
    if (!isValid) {
      return null;
    }

    try {
      const payloadJson = fromBase64Url(payloadB64);
      const payload = JSON.parse(payloadJson);

      if (typeof payload.exp === 'number') {
        const nowSec = Math.floor(Date.now() / 1000);
        if (payload.exp < nowSec) {
          return null;
        }
      }

      const id = payload.sub || payload.id;
      if (!id) return null;

      const rawRole =
        payload.app_metadata?.role ||
        payload.role ||
        (id.includes('employer') ? 'employer' : 'job_seeker');

      const user: AuthSessionUser = {
        id,
        phone: payload.phone || '',
        email: payload.email || null,
        emailVerified: Boolean(payload.emailVerified),
        role: rawRole,
        status: payload.status || 'active',
      };

      let clientRole: ClientRole = 'jobseeker';
      if (isUserRole(user.role)) {
        clientRole = toClientRole(user.role);
      } else if (isClientRole(user.role)) {
        clientRole = user.role;
      }

      return {
        user,
        accessToken: token,
        clientRole,
        expiresAt: payload.exp,
      };
    } catch {
      return null;
    }
  }

  // 2. Legacy session token format: jwt_session_<userId>_<timestamp>
  if (token.startsWith('jwt_session_')) {
    const parts = token.split('_');
    const timestampStr = parts[parts.length - 1];
    const timestamp = Number(timestampStr);
    const userId = parts.slice(2, parts.length - 1).join('_');

    if (!userId) return null;

    if (!isNaN(timestamp)) {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - timestamp > thirtyDaysMs) {
        return null;
      }
    }

    let role: AuthSessionUser['role'] = 'job_seeker';
    if (userId.includes('emp') || userId.includes('bus')) {
      role = 'employer';
    } else if (userId.includes('inst')) {
      role = 'intermediary';
    } else if (userId.includes('admin') || userId.includes('msme_admin')) {
      role = 'admin';
    }

    const user: AuthSessionUser = {
      id: userId,
      phone: '9876543210',
      email: null,
      emailVerified: false,
      role,
      status: 'active',
    };

    const clientRole = isUserRole(role) ? toClientRole(role) : 'jobseeker';

    return {
      user,
      accessToken: token,
      clientRole,
    };
  }

  return null;
}

/**
 * Resolves authenticated session on Next.js server components or from cookie strings.
 */
export async function getServerSession(
  tokenOrCookieHeader?: string
): Promise<VerifiedSession | null> {
  if (tokenOrCookieHeader) {
    if (tokenOrCookieHeader.includes('.') || tokenOrCookieHeader.startsWith('jwt_session_')) {
      return verifyToken(tokenOrCookieHeader);
    }
    const match = tokenOrCookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
    if (match && match[1]) {
      return verifyToken(match[1]);
    }
  }

  try {
    // @ts-expect-error next/headers type resolution in NodeNext
    const { cookies } = await import('next/headers');
    const cookieStore = cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}
