import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseProvider } from '../src/auth/supabase-provider.js';

describe('AUTH-06 native provider revocation boundary', () => {
  const url = process.env['SUPABASE_URL']!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env['SUPABASE_SERVICE_ROLE_KEY']!, options);
  const provider = () => createSupabaseProvider({ url, publishableKey: process.env['SUPABASE_ANON_KEY']!, environment: 'test' });
  async function fixture() {
    const email = 'revocation-' + randomUUID() + '@example.invalid';
    const password = randomBytes(32).toString('base64url');
    // Admin/password bootstrap is disposable test setup, never an application login feature.
    const seeded = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(seeded.error).toBeNull();
    const clients = [0, 1].map(() => createClient(url, process.env['SUPABASE_ANON_KEY']!, options));
    const logins = await Promise.all(clients.map(client => client.auth.signInWithPassword({ email, password })));
    for (const login of logins) expect(login.error).toBeNull();
    const tokens = logins.map(login => login.data.session!.access_token);
    for (const token of tokens) expect(await provider().authenticate(token)).toMatchObject({ authUserId: seeded.data.user!.id });
    return { userId: seeded.data.user!.id, clients, tokens };
  }

  it('denies copied credentials after local/global provider logout while preserving the unrelated local session', async () => {
    const { clients, tokens } = await fixture();
    expect((await clients[0]!.auth.signOut({ scope: 'local' })).error).toBeNull();
    await expect(provider().authenticate(tokens[0]!)).rejects.toMatchObject({ status: 401, message: 'AUTH_PROVIDER_INVALID' });
    expect(await provider().authenticate(tokens[1]!)).toMatchObject({ providerSessionId: expect.any(String) });
    expect((await clients[1]!.auth.signOut({ scope: 'global' })).error).toBeNull();
    for (const token of tokens) await expect(provider().authenticate(token)).rejects.toMatchObject({ status: 401, message: 'AUTH_PROVIDER_INVALID' });
  });

  it('denies a copied, unexpired credential after its provider identity is deleted', async () => {
    const { userId, tokens } = await fixture();
    expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
    for (const token of tokens) await expect(provider().authenticate(token)).rejects.toMatchObject({ status: 401, message: 'AUTH_PROVIDER_INVALID' });
  });
});
