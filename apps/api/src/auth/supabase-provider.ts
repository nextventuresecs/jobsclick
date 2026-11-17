import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createClient, isAuthError } from '@supabase/supabase-js';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { z } from 'zod';

const identityClaims = z.object({
  sub: z.string().uuid(), session_id: z.string().uuid(),
  iat: z.number().int(), exp: z.number().int(),
  iss: z.string(), aud: z.union([z.string(), z.array(z.string())]),
  is_anonymous: z.literal(false).optional(),
});
const currentIdentity = z.object({
  id: z.string().uuid(), is_anonymous: z.literal(false),
  banned_until: z.string().datetime({ offset: true }).nullable().optional(),
  deleted_at: z.string().datetime({ offset: true }).nullable().optional(),
});
function providerFailure(error: unknown): never {
  if (isAuthError(error) && error.status && [400, 401, 403, 404, 422].includes(error.status)) {
    throw new UnauthorizedException('AUTH_PROVIDER_INVALID');
  }
  throw new ServiceUnavailableException('AUTH_PROVIDER_UNAVAILABLE');
}
function providerOrigin(config: { url: string; publishableKey: string; environment: string }): string {
  try {
    const url = new URL(config.url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const validEnvironment = ['test', 'development', 'staging', 'production'].includes(config.environment);
    const key = config.publishableKey;
    const publicKey = key.startsWith('sb_publishable_') || (key.startsWith('eyJ') && decodeJwt(key).role === 'anon');
    if (!validEnvironment || url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && local && ['test', 'development'].includes(config.environment)))
      || !publicKey) throw new Error('Invalid config');
    return url.origin;
  } catch { throw new Error('AUTH_PROVIDER_CONFIG_INVALID'); }
}

/** Request-scoped server client. Never reuse its user/session state globally. */
export function createSupabaseProvider(config: { url: string; publishableKey: string; environment: string }) {
  const origin = providerOrigin(config);
  const serverFetch: typeof fetch = async (input, init) => {
      try {
        const deadline = AbortSignal.timeout(5000);
        return await fetch(input, { ...init, cache: 'no-store', redirect: 'error',
          signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
      } catch {
        // Keep SDK network diagnostics from logging request credentials/upstream errors.
        return Response.json({ code: 'AUTH_PROVIDER_UNAVAILABLE' }, { status: 503 });
      }
    };
  const client = createClient(origin, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: serverFetch },
  });
  const provider = {
    async authenticate(accessToken: string) {
      try {
        if (!['HS256', 'ES256', 'RS256'].includes(decodeProtectedHeader(accessToken).alg || '')) {
          throw new Error('Invalid algorithm');
        }
      } catch { throw new UnauthorizedException('AUTH_PROVIDER_INVALID'); }
      const { data, error } = await client.auth.getClaims(accessToken).catch(providerFailure);
      if (error) providerFailure(error);
      if (!data) throw new UnauthorizedException('AUTH_PROVIDER_INVALID');
      const claims = identityClaims.safeParse(data.claims);
      if (!claims.success || claims.data.iss !== `${origin}/auth/v1`
        || !(Array.isArray(claims.data.aud) ? claims.data.aud : [claims.data.aud]).includes('authenticated')
        || claims.data.iat > Math.floor(Date.now() / 1000)
        || claims.data.exp <= Math.floor(Date.now() / 1000) || claims.data.exp <= claims.data.iat) {
        throw new UnauthorizedException('AUTH_PROVIDER_INVALID');
      }
      const user = await client.auth.getUser(accessToken).catch(providerFailure);
      if (user.error) providerFailure(user.error);
      const current = currentIdentity.safeParse(user.data.user);
      if (user.error || !current.success || current.data.id !== claims.data.sub
        || current.data.deleted_at || (current.data.banned_until && Date.parse(current.data.banned_until) > Date.now())) {
        throw new UnauthorizedException('AUTH_PROVIDER_INVALID');
      }
      return {
        authUserId: claims.data.sub, providerSessionId: claims.data.session_id,
        issuedAt: claims.data.iat, expiresAt: claims.data.exp,
      };
    },
    async refresh(refreshToken: string) {
      if (!refreshToken || refreshToken.length > 16384) throw new UnauthorizedException('AUTH_PROVIDER_INVALID');
      // Use the provider's refresh endpoint once. The installed SDK automatically retries
      // retryable refresh errors, which is unsafe after an ambiguous token-rotation response.
      const response = await serverFetch(`${origin}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if ([400, 401, 403, 422].includes(response.status)) throw new UnauthorizedException('AUTH_PROVIDER_INVALID');
      if (!response.ok) throw new ServiceUnavailableException('AUTH_PROVIDER_UNAVAILABLE');
      const parsed = z.object({ access_token: z.string().min(1).max(16384), refresh_token: z.string().min(1).max(16384) })
        .safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new ServiceUnavailableException('AUTH_PROVIDER_UNAVAILABLE');
      const identity = await provider.authenticate(parsed.data.access_token);
      return { authUserId: identity.authUserId, providerSessionId: identity.providerSessionId,
        accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token, accessExpiresAt: identity.expiresAt };
    },
  };
  return provider;
}
