import { createServer, type Server } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, generateKeyPair, exportJWK, decodeProtectedHeader, type JWK } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('AUTH-01 request-scoped Supabase provider boundary', () => {
  const signingKey = randomBytes(32);
  const id = randomUUID();
  const sessionId = randomUUID();
  let server: Server;
  let origin: string;
  let userOverrides: Record<string, unknown> = {};
  let outage = false;
  let malformedJwks = false;
  let refreshRequests = 0;
  let jwksRequests = 0;
  let signingPairs: Awaited<ReturnType<typeof generateKeyPair>>[];
  let jwks: JWK[] = [];
  const fakeUser = () => ({ id, aud: 'authenticated', role: 'authenticated', is_anonymous: false, created_at: new Date().toISOString(), app_metadata: {}, user_metadata: { role: 'admin' }, ...userOverrides });
  beforeEach(() => { userOverrides = {}; outage = false; malformedJwks = false; refreshRequests = 0; jwksRequests = 0; });
  beforeAll(async () => {
    signingPairs = await Promise.all([generateKeyPair('ES256'), generateKeyPair('ES256')]);
    jwks = await Promise.all(signingPairs.map(async (pair, index) => ({ ...await exportJWK(pair.publicKey), kid: `synthetic-${index}`, alg: 'ES256', use: 'sig' })));
    server = createServer(async (request, response) => {
      response.setHeader('content-type', 'application/json');
      try {
        if (request.url === '/auth/v1/.well-known/jwks.json') {
          jwksRequests++;
          response.end(JSON.stringify({ keys: malformedJwks ? [{ kid: 'synthetic-bad-key', kty: 'EC', crv: 'invalid' }] : jwks })); return;
        }
        if (request.url === '/auth/v1/token?grant_type=refresh_token' && request.method === 'POST') {
          refreshRequests++;
          if (outage) { response.statusCode = 503; response.end('{}'); return; }
          let body = '';
          for await (const chunk of request) body += String(chunk);
          if (JSON.parse(body).refresh_token !== 'synthetic-refresh') { response.statusCode = 401; response.end(JSON.stringify({ code: 'refresh_token_not_found' })); return; }
          const access_token = await new SignJWT({ session_id: sessionId }).setProtectedHeader({ alg: 'HS256' })
            .setSubject(id).setIssuer(`${origin}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime('15m').sign(signingKey);
          response.end(JSON.stringify({ access_token, refresh_token: 'synthetic-rotated-refresh', expires_in: 900, token_type: 'bearer', user: fakeUser() }));
          return;
        }
        if (request.url !== '/auth/v1/user') { response.statusCode = 404; response.end('{}'); return; }
        if (outage) { response.statusCode = 503; response.end(JSON.stringify({ msg: 'synthetic-private-upstream-detail' })); return; }
        // Signature-only fixture: the adapter must independently bind issuer/audience.
        const token = (request.headers.authorization || '').replace(/^Bearer /, '');
        const header = decodeProtectedHeader(token);
        const pair = signingPairs.find((_, index) => header.kid === `synthetic-${index}`);
        await jwtVerify(token, pair?.publicKey || signingKey);
        response.end(JSON.stringify(fakeUser()));
      } catch { response.statusCode = 401; response.end(JSON.stringify({ code: 'bad_jwt', msg: 'Synthetic invalid token' })); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture listen failed');
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

  it('verifies provider identity without requiring legacy tv/jti or returning credentials/roles', async () => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ session_id: sessionId, role: 'authenticated', is_anonymous: false })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(id).setIssuer(`${origin}/auth/v1`)
      .setAudience('authenticated').setIssuedAt(issuedAt).setExpirationTime(issuedAt + 900).sign(signingKey);
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    const identity = await provider.authenticate(token);
    expect(identity).toEqual({ authUserId: id, providerSessionId: sessionId, issuedAt, expiresAt: issuedAt + 900 });
    expect(JSON.stringify(identity)).not.toContain(token);
    expect(JSON.stringify(identity)).not.toContain('admin');
  });

  it.each(['issuer', 'audience'])('rejects a validly signed token with the wrong %s', async field => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    const token = await new SignJWT({ session_id: sessionId })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(id)
      .setIssuer(field === 'issuer' ? 'https://other-project.invalid/auth/v1' : `${origin}/auth/v1`)
      .setAudience(field === 'audience' ? 'service_role' : 'authenticated')
      .setIssuedAt().setExpirationTime('15m').sign(signingKey);
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    await expect(provider.authenticate(token)).rejects.toMatchObject({ message: 'AUTH_PROVIDER_INVALID', status: 401 });
  });

  it.each(['anonymous', 'banned', 'deleted', 'different-subject'])('rejects a currently %s provider identity', async state => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    userOverrides = state === 'anonymous' ? { is_anonymous: true }
      : state === 'banned' ? { banned_until: new Date(Date.now() + 60000).toISOString() }
      : state === 'deleted' ? { deleted_at: new Date().toISOString() } : { id: randomUUID() };
    const token = await new SignJWT({ session_id: sessionId })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(id).setIssuer(`${origin}/auth/v1`)
      .setAudience('authenticated').setIssuedAt().setExpirationTime('15m').sign(signingKey);
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    await expect(provider.authenticate(token)).rejects.toMatchObject({ message: 'AUTH_PROVIDER_INVALID', status: 401 });
  });

  it.each(['future-issued', 'anonymous-claim', 'unsupported-algorithm'])('rejects %s tokens even if the provider accepts them', async kind => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ session_id: sessionId, is_anonymous: kind === 'anonymous-claim' })
      .setProtectedHeader({ alg: kind === 'unsupported-algorithm' ? 'HS384' : 'HS256' })
      .setSubject(id).setIssuer(`${origin}/auth/v1`).setAudience('authenticated')
      .setIssuedAt(kind === 'future-issued' ? now + 3600 : now).setExpirationTime(now + 7200).sign(signingKey);
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    await expect(provider.authenticate(token)).rejects.toMatchObject({ message: 'AUTH_PROVIDER_INVALID', status: 401 });
  });

  it('fails closed with a safe dependency error when Auth is unavailable', async () => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    const token = await new SignJWT({ session_id: sessionId }).setProtectedHeader({ alg: 'HS256' })
      .setSubject(id).setIssuer(`${origin}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime('15m').sign(signingKey);
    outage = true;
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    await expect(provider.authenticate(token)).rejects.toMatchObject({ message: 'AUTH_PROVIDER_UNAVAILABLE', status: 503 });
  });

  it.each([
    { url: 'http://remote.invalid' },
    { url: 'https://username:password@project.invalid' },
    { url: 'https://project.invalid/?token=synthetic' },
    { url: 'https://project.invalid/custom-path' },
    { publishableKey: 'sb_secret_synthetic-must-never-use-admin' },
    { environment: 'unrecognized' },
    { url: 'http://127.0.0.1:54321', environment: 'production' },
  ])('rejects unsafe server configuration before making requests: %j', async override => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    expect(() => createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test', ...override }))
      .toThrow('AUTH_PROVIDER_CONFIG_INVALID');
  });

  it.each(['invalid-signature', 'expired', 'missing-session', 'bad-session', 'unsigned', 'malformed'])('rejects %s credentials', async kind => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    const token = kind === 'malformed' ? 'not.a.jwt' : kind === 'unsigned'
      ? `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{}').toString('base64url')}.`
      : await new SignJWT({ session_id: kind === 'missing-session' ? undefined : kind === 'bad-session' ? 'invalid' : sessionId })
        .setProtectedHeader({ alg: 'HS256' }).setSubject(id).setIssuer(`${origin}/auth/v1`).setAudience('authenticated')
        .setIssuedAt().setExpirationTime(kind === 'expired' ? '0s' : '15m').sign(kind === 'invalid-signature' ? randomBytes(32) : signingKey);
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    await expect(provider.authenticate(token)).rejects.toMatchObject({ message: 'AUTH_PROVIDER_INVALID', status: 401 });
  });

  it('verifies real asymmetric signatures and rotated keys through the SDK JWKS boundary', async () => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    for (let index = 0; index < 2; index++) {
      const token = await new SignJWT({ session_id: sessionId }).setProtectedHeader({ alg: 'ES256', kid: `synthetic-${index}` })
        .setSubject(id).setIssuer(`${origin}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime('15m').sign(signingPairs[index]!.privateKey);
      expect(await provider.authenticate(token)).toMatchObject({ authUserId: id, providerSessionId: sessionId });
    }
    const forged = await new SignJWT({ session_id: sessionId }).setProtectedHeader({ alg: 'ES256', kid: 'synthetic-0' })
      .setSubject(id).setIssuer(`${origin}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime('15m').sign(signingPairs[1]!.privateKey);
    await expect(provider.authenticate(forged)).rejects.toMatchObject({ message: 'AUTH_PROVIDER_INVALID', status: 401 });
    expect(jwksRequests).toBeGreaterThan(0);
  });

  it('rotates refresh credentials only in the server adapter and revalidates the returned identity', async () => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    const credentials = await provider.refresh('synthetic-refresh');
    expect(credentials).toEqual({ authUserId: id, providerSessionId: sessionId, accessToken: expect.any(String),
      refreshToken: 'synthetic-rotated-refresh', accessExpiresAt: expect.any(Number) });
    expect(await provider.authenticate(credentials.accessToken)).toMatchObject({ authUserId: id, expiresAt: credentials.accessExpiresAt });
    await expect(provider.refresh('synthetic-invalid-refresh')).rejects.toMatchObject({ status: 401, message: 'AUTH_PROVIDER_INVALID' });
  });

  it('does not retry a refresh after an ambiguous upstream failure', async () => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    outage = true;
    await expect(provider.refresh('synthetic-refresh')).rejects.toMatchObject({ status: 503, message: 'AUTH_PROVIDER_UNAVAILABLE' });
    expect(refreshRequests).toBe(1);
  });

  it('sanitizes unexpected SDK key-validation failures', async () => {
    const { createSupabaseProvider } = await import('../src/auth/supabase-provider.js');
    malformedJwks = true;
    const token = await new SignJWT({ session_id: sessionId }).setProtectedHeader({ alg: 'ES256', kid: 'synthetic-bad-key' })
      .setSubject(id).setIssuer(`${origin}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime('15m').sign(signingPairs[0]!.privateKey);
    const provider = createSupabaseProvider({ url: origin, publishableKey: 'sb_publishable_synthetic-local-fixture', environment: 'test' });
    await expect(provider.authenticate(token)).rejects.toMatchObject({ status: 503, message: 'AUTH_PROVIDER_UNAVAILABLE' });
  });

});
