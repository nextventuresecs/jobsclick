import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseProvider } from '../src/auth/supabase-provider.js';

// Runs after M1/M2 in the disposable runner. Never run against a developer/hosted DB.
describe.runIf(process.env['RUN_AUTH_NATIVE'] === '1')('AUTH-01 actual GoTrue identity and M2 integration', () => {
  const url = process.env['SUPABASE_URL']!;
  const service = createClient(url, process.env['SUPABASE_SERVICE_ROLE_KEY']!, { auth: { persistSession: false, autoRefreshToken: false } });
  const publicClient = createClient(url, process.env['SUPABASE_ANON_KEY']!, { auth: { persistSession: false, autoRefreshToken: false } });
  const config = { url, publishableKey: process.env['SUPABASE_ANON_KEY']!, environment: 'test' };
  const applicationId = randomUUID();
  let providerId: string;
  let accessToken: string;
  beforeAll(async () => {
    const phone = `9${randomInt(100000000, 999999999)}`;
    const email = `native-${randomUUID()}@example.invalid`;
    const password = randomBytes(32).toString('base64url');
    // Admin-seeded password is a test credential bootstrap, not an approved login feature.
    const seeded = await service.auth.admin.createUser({ email, password, email_confirm: true, phone: `+91${phone}`, phone_confirm: true, user_metadata: { role: 'admin' } });
    expect(seeded.error).toBeNull(); providerId = seeded.data.user!.id;
    expect((await service.from('users').insert({ id: applicationId, phone, role: 'employer', status: 'invited', source: process.env['JOBSCLICK_TEST_RUN_ID'] })).error).toBeNull();
    const login = await publicClient.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull(); accessToken = login.data.session!.access_token;
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
    const proof = { project: process.env['JOBSCLICK_TEST_RUN_ID'], issuerMatches: claims['iss'] === url + '/auth/v1',
      audience: claims['aud'], issuedAt: claims['iat'], expiresAt: claims['exp'], hostNow: Math.floor(Date.now() / 1000),
      hasUuidSession: typeof claims['session_id'] === 'string' && /^[0-9a-f-]{36}$/.test(claims['session_id']),
      hasUuidSubject: typeof claims['sub'] === 'string' && /^[0-9a-f-]{36}$/.test(claims['sub']), anonymous: claims['is_anonymous'] };
    mkdirSync('docs/auth/evidence/followup/CI', { recursive: true });
    writeFileSync('docs/auth/evidence/followup/CI/native-claims-diagnostic.json', JSON.stringify(proof, null, 2));
    // Decoded diagnostics above are not authentication; the adapter still verifies signatures and current provider state.
  });

  it('verifies an actual provider-issued subject and claims the preserved invited UUID without trusting metadata role', async () => {
    const identity = await createSupabaseProvider(config).authenticate(accessToken);
    expect(identity.authUserId).toBe(providerId);
    expect(Object.keys(identity).sort()).toEqual(['authUserId', 'expiresAt', 'issuedAt', 'providerSessionId']);
    let claimed = await service.rpc('rpc_claim_invited_account', { p_auth_user_id: identity.authUserId, p_request_id: randomUUID() });
    for (let attempt = 0; claimed.error?.code === 'PGRST202' && attempt < 10; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      claimed = await service.rpc('rpc_claim_invited_account', { p_auth_user_id: identity.authUserId, p_request_id: randomUUID() });
    }
    expect(claimed.error).toBeNull();
    expect(claimed.data).toMatchObject({ outcome: 'success', user_id: applicationId });
    const account = await service.from('users').select('role,status').eq('id', applicationId).single();
    expect(account.data).toEqual({ role: 'employer', status: 'invited' });
  });

  it('revalidates a copied access credential after an actual GoTrue ban', async () => {
    expect((await service.auth.admin.updateUserById(providerId, { ban_duration: '1h' })).error).toBeNull();
    await expect(createSupabaseProvider(config).authenticate(accessToken)).rejects.toMatchObject({ status: 401, message: 'AUTH_PROVIDER_INVALID' });
  });
  // Keep committed claim/audit fixtures intact. The entire disposable stack is destroyed.
});
