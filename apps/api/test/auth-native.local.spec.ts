import { randomBytes, randomInt, randomUUID } from 'node:crypto';
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
