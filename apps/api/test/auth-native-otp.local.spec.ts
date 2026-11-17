import { randomInt, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import fastify, { type FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SupabaseSmsHook, type SmsHookPolicy } from '../src/auth/supabase-sms-hook.js';
import { createSupabaseProvider } from '../src/auth/supabase-provider.js';
import { getClientIp } from '../src/common/ip-normalizer.js';

describe.runIf(process.env['RUN_AUTH_NATIVE_OTP'] === '1')('AUTH-01/03 real GoTrue OTP, hook and CAPTCHA', () => {
  const url = process.env['SUPABASE_URL']!, key = process.env['SUPABASE_ANON_KEY']!;
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const caller = () => createClient(url, key, options);
  const backend = createClient(url, process.env['SUPABASE_SERVICE_ROLE_KEY']!, options);
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  const redis = new Redis(process.env['REDIS_URL']!, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, commandTimeout: 1000 });
  const validCaptcha = 'XXXX.DUMMY.TOKEN.XXXX';
  const hookPort = Number(process.env['JOBSCLICK_TEST_HOOK_PORT']);
  const runId = process.env['JOBSCLICK_TEST_RUN_ID']!;
  const phone = () => '8' + randomInt(100000000, 999999999);
  const deliveries: { phone: string; otp: string }[] = [];
  const requests: { raw: Buffer; headers: Record<string, string> }[] = [];
  let server: FastifyInstance, hook: SupabaseSmsHook, apiSocketIp = '';
  let policy: SmsHookPolicy;
  const observations: Record<string, unknown> = { runId, approvedProductLoginEnabled: false, google: 'NOT RUN: reviewed Google OAuth fixture unavailable' };
  function save() {
    mkdirSync('docs/auth/evidence/S4-native', { recursive: true });
    writeFileSync('docs/auth/evidence/S4-native/observations.json', JSON.stringify(observations, null, 2));
  }
  function resetHook(overrides: Partial<SmsHookPolicy> = {}) {
    policy = { phoneHmacKey: Buffer.from(process.env['JOBSCLICK_TEST_SMS_HMAC_KEY']!, 'base64'), phoneDailyLimit: 10,
      cooldownSeconds: 1, globalBudgetPaise: 30, sendCostPaise: 1, blockedPrefixes: [], ...overrides };
    hook = new SupabaseSmsHook({ secret: process.env['JOBSCLICK_TEST_SMS_HOOK_SECRET']!, redis,
      namespace: 'native-otp:' + randomUUID(), policy, send: async delivery => { deliveries.push({ phone: delivery.phone, otp: delivery.otp }); } });
  }
  beforeAll(async () => {
    await db.connect(); await redis.connect();
    expect((await db.query('select (select count(*)::int from public.users) as users,(select count(*)::int from auth.users) as auth')).rows)
      .toEqual([{ users: 0, auth: 0 }]);
    server = fastify({ logger: false, bodyLimit: 65536 });
    server.removeContentTypeParser('application/json');
    server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    server.post('/supabase-sms-hook', async (request, reply) => {
      const raw = request.body as Buffer;
      const headers = Object.fromEntries(['webhook-id', 'webhook-timestamp', 'webhook-signature'].map(name => [name, String(request.headers[name] || '')]));
      requests.push({ raw, headers });
      try { return await hook.handle(raw, request.headers); }
      catch (error) {
        const failure = error as { getStatus?: () => number; message?: string };
        const status = failure.getStatus?.() || 503;
        observations['lastHookFailure'] = { status, code: failure.message }; save();
        return reply.code(status).send({ error: { http_code: status, message: failure.message || 'AUTH_HOOK_FAILED' } });
      }
    });
    // Controlled server-side API transport, not a registered product endpoint.
    server.post('/api/otp', async request => {
      apiSocketIp = getClientIp(request);
      const body = JSON.parse((request.body as Buffer).toString('utf8')) as { phone: string; captchaToken: string };
      const result = await caller().auth.signInWithOtp({ phone: body.phone, options: { captchaToken: body.captchaToken } });
      return { accepted: !result.error };
    });
    await server.listen({ port: hookPort, host: '0.0.0.0' });
  });
  beforeEach(() => { deliveries.length = 0; requests.length = 0; resetHook(); });
  afterAll(async () => { save(); await server?.close(); await Promise.all([db.end(), redis.quit()]); });
  async function proveSession(accessToken: string, channel: 'phone' | 'email') {
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString()) as Record<string, unknown>;
    observations[channel + 'ClaimShape'] = { issuerMatches: claims['iss'] === url + '/auth/v1', aud: claims['aud'], iat: claims['iat'], exp: claims['exp'], hostNow: Math.floor(Date.now() / 1000), anonymous: claims['is_anonymous'], role: claims['role'], sessionUuid: typeof claims['session_id'] === 'string' && /^[0-9a-f-]{36}$/.test(claims['session_id']) }; save();
    const identity = await createSupabaseProvider({ url, publishableKey: key, environment: 'test' }).authenticate(accessToken);
    const proof = (await db.query("select raw_app_meta_data->>'provider' as provider,raw_app_meta_data->'providers' as providers from auth.users where id=$1", [identity.authUserId])).rows[0];
    observations[channel + 'Metadata'] = proof; save(); return identity;
  }
  it('rejects provider-direct phone OTP without a CAPTCHA before any hook or send', async () => {
    const result = await caller().auth.signInWithOtp({ phone: '+91' + phone() });
    expect(result.error?.code).toBe('captcha_failed');
    observations['noCaptcha'] = { rejected: Boolean(result.error), hookCalls: requests.length, sends: deliveries.length }; save();
    expect(Boolean(result.error)).toBe(true); expect(deliveries).toHaveLength(0); expect(requests).toHaveLength(0);
  });
  it.runIf(process.env['JOBSCLICK_TEST_CAPTCHA_MODE'] === 'reject')('rejects provider-direct phone OTP with an invalid CAPTCHA before any send', async () => {
    const result = await caller().auth.signInWithOtp({ phone: '+91' + phone(), options: { captchaToken: 'invalid-not-a-dummy-token' } });
    expect(result.error?.code).toBe('captcha_failed');
    observations['invalidCaptcha'] = { rejected: Boolean(result.error), hookCalls: requests.length, sends: deliveries.length }; save();
    expect(Boolean(result.error)).toBe(true); expect(deliveries).toHaveLength(0);
  });
  it('completes phone OTP through a real signed hook and claims the preserved invited UUID', async () => {
    const number = phone(), userId = randomUUID();
    expect((await backend.from('users').insert({ id: userId, phone: number, role: 'employer', status: 'invited', source: 'native-otp-fixture' })).error).toBeNull();
    const sent = await caller().auth.signInWithOtp({ phone: '+91' + number, options: { captchaToken: validCaptcha, data: { role: 'admin' } } });
    observations['phoneRequest'] = { code: sent.error?.code, status: sent.error?.status, hookCalls: requests.length, sends: deliveries.length }; save();
    expect(Boolean(sent.error)).toBe(false); expect(deliveries).toHaveLength(1);
    const otp = deliveries[0]!.otp; expect(/^[0-9]{6}$/.test(otp)).toBe(true);
    const verified = await caller().auth.verifyOtp({ phone: '+91' + number, token: otp, type: 'sms' });
    expect(Boolean(verified.error)).toBe(false); expect(Boolean(verified.data.session)).toBe(true);
    const identity = await proveSession(verified.data.session!.access_token, 'phone');
    const claimed = await backend.rpc('rpc_claim_invited_account', { p_auth_user_id: identity.authUserId, p_request_id: randomUUID() });
    expect(claimed.error).toBeNull(); expect(claimed.data).toMatchObject({ outcome: 'success', user_id: userId });
    expect((await backend.from('users').select('role,status,source').eq('id', userId).single()).data)
      .toEqual({ role: 'employer', status: 'invited', source: 'native-otp-fixture' });
    const prior = requests[0]!;
    const replay = await fetch('http://127.0.0.1:' + hookPort + '/supabase-sms-hook', { method: 'POST', headers: { ...prior.headers, 'content-type': 'application/json' }, body: prior.raw });
    expect(replay.status).toBe(409); expect(deliveries).toHaveLength(1);
    const unsigned = await fetch('http://127.0.0.1:' + hookPort + '/supabase-sms-hook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: prior.raw });
    expect(unsigned.status).toBe(401); expect(deliveries).toHaveLength(1);
    const log = spawnSync('docker', ['logs', 'supabase_auth_' + runId], { encoding: 'utf8', windowsHide: true });
    expect(log.status).toBe(0); expect(((log.stdout || '') + (log.stderr || '')).includes(otp)).toBe(false);
    observations['phoneChain'] = { realGoTrue: true, adminSeededConfirmedPhone: false, sends: deliveries.length, replayStatus: replay.status, unsignedStatus: unsigned.status, otpInAuthLogs: false }; save();
  });
  it('requires fresh CAPTCHA on a direct resend and does not double-send', async () => {
    const number = phone();
    expect(Boolean((await caller().auth.signInWithOtp({ phone: '+91' + number, options: { captchaToken: validCaptcha } })).error)).toBe(false);
    expect(deliveries).toHaveLength(1);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const result = await caller().auth.resend({ type: 'sms', phone: '+91' + number });
    observations['resendWithoutCaptcha'] = { rejected: Boolean(result.error), sends: deliveries.length }; save();
    expect(Boolean(result.error)).toBe(true); expect(deliveries).toHaveLength(1);
  });
  it('refuses a foreign phone and exhausted budget before fake delivery', async () => {
    const foreign = await caller().auth.signInWithOtp({ phone: '+14155552671', options: { captchaToken: validCaptcha } });
    expect(Boolean(foreign.error)).toBe(true); expect(deliveries).toHaveLength(0);
    resetHook({ globalBudgetPaise: 0 });
    const exhausted = await caller().auth.signInWithOtp({ phone: '+91' + phone(), options: { captchaToken: validCaptcha } });
    expect(Boolean(exhausted.error)).toBe(true); expect(deliveries).toHaveLength(0);
    observations['deliveryDenials'] = { foreignPhoneRejected: true, emptyBudgetRejected: true, sends: 0 }; save();
  });
  it('records actual GoTrue IPs for direct and server-side API calls', async () => {
    const direct = phone();
    expect(Boolean((await caller().auth.signInWithOtp({ phone: '+91' + direct, options: { captchaToken: validCaptcha } })).error)).toBe(false);
    const directSession = await caller().auth.verifyOtp({ phone: '+91' + direct, token: deliveries[0]!.otp, type: 'sms' });
    expect(Boolean(directSession.error)).toBe(false);
    const throughApi = phone();
    const api = await fetch('http://127.0.0.1:' + hookPort + '/api/otp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.77' }, body: JSON.stringify({ phone: '+91' + throughApi, captchaToken: validCaptcha }) });
    expect((await api.json()).accepted).toBe(true); expect(deliveries).toHaveLength(2);
    const apiSession = await caller().auth.verifyOtp({ phone: '+91' + throughApi, token: deliveries[1]!.otp, type: 'sms' });
    expect(Boolean(apiSession.error)).toBe(false);
    const ips = async (id: string) => (await db.query("select distinct ip_address,payload->>'action' as action from auth.audit_log_entries where payload->>'actor_id'=$1 order by action,ip_address", [id])).rows;
    observations['ipReality'] = { apiSocketIp, suppliedUntrustedHeader: '203.0.113.77', direct: await ips(directSession.data.user!.id), serverSideApi: await ips(apiSession.data.user!.id), productionBffCutover: false }; save();
    expect(apiSocketIp).not.toBe('203.0.113.77');
  });
  it('verifies email OTP from the local mail catcher and claims without inventing a phone', async () => {
    const email = 'native-' + randomUUID() + '@example.invalid', userId = randomUUID();
    expect((await backend.from('users').insert({ id: userId, email, phone: null, role: 'job_seeker', status: 'invited', source: 'native-email-fixture' })).error).toBeNull();
    const sent = await caller().auth.signInWithOtp({ email, options: { captchaToken: validCaptcha } });
    expect(Boolean(sent.error)).toBe(false);
    const mailApi = process.env['JOBSCLICK_TEST_MAIL_URL']! + '/api/v1';
    let otp = '';
    for (let attempt = 0; attempt < 40 && !otp; attempt++) {
      const response = await fetch(mailApi + '/search?query=' + encodeURIComponent('to:' + email));
      observations['mailTransport'] = { status: response.status, contentType: response.headers.get('content-type'), server: 'mailpit' }; save();
      const list = await response.json() as { messages: { ID: string }[] };
      if (list.messages.length) {
        const message = await (await fetch(mailApi + '/message/' + list.messages[0]!.ID)).json() as { Text?: string; HTML?: string };
        otp = ((message.Text || '') + (message.HTML || '')).match(/\b[0-9]{6}\b/)?.[0] || '';
      }
      if (!otp) await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(Boolean(otp)).toBe(true);
    const verified = await caller().auth.verifyOtp({ email, token: otp, type: 'email' });
    expect(Boolean(verified.error)).toBe(false); const identity = await proveSession(verified.data.session!.access_token, 'email');
    const claimed = await backend.rpc('rpc_claim_invited_account', { p_auth_user_id: identity.authUserId, p_request_id: randomUUID() });
    expect(claimed.error).toBeNull(); expect(claimed.data).toMatchObject({ outcome: 'success', user_id: userId });
    expect((await backend.from('users').select('phone,status,source').eq('id', userId).single()).data).toEqual({ phone: null, status: 'invited', source: 'native-email-fixture' });
    expect(deliveries).toHaveLength(0);
    observations['emailChain'] = { realGoTrue: true, localMailCatcher: true, adminSeededConfirmedEmail: false, importedPhoneRemainsNull: true, smsSends: 0, generalEmailLoginEnabled: false }; save();
  });
});
