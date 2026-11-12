import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { OtpRedisService, AUTH_STATE_TTL_SECONDS } from '../src/auth/otp-redis.service.js';
import { AdminService } from '../src/admin/admin.service.js';

describe('Immediate Session Invalidation & Fail-Closed State (P0-8 Integration)', () => {
  let appA: NestFastifyApplication;
  let appB: NestFastifyApplication;
  let userRepoA: UserRepository;
  let otpRedisA: OtpRedisService;
  let jwtServiceA: JwtService;
  let adminServiceA: AdminService;

  beforeAll(async () => {
    // Instance A
    const moduleFixtureA: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    appA = moduleFixtureA.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await appA.init();
    await appA.getHttpAdapter().getInstance().ready();

    userRepoA = moduleFixtureA.get<UserRepository>(UserRepository);
    otpRedisA = moduleFixtureA.get<OtpRedisService>(OtpRedisService);
    jwtServiceA = moduleFixtureA.get<JwtService>(JwtService);
    adminServiceA = moduleFixtureA.get<AdminService>(AdminService);

    // Instance B (simulates separate container/cluster node sharing same DB and Redis)
    const moduleFixtureB: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    appB = moduleFixtureB.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await appB.init();
    await appB.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await appA.close();
    await appB.close();
  });

  // Test 1: Administrator demotion
  it('Test 1: Administrator demotion immediately revokes admin access on subsequent requests using existing JWT', async () => {
    const rootAdminPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    const targetAdminPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);

    const rootAdmin = await userRepoA.create({ phone: rootAdminPhone, role: 'admin', status: 'active' });
    const targetAdmin = await userRepoA.create({ phone: targetAdminPhone, role: 'admin', status: 'active' });

    const rootToken = await jwtServiceA.signAccessToken(rootAdmin.id, rootAdmin.token_version ?? 0, { role: 'admin' });
    const targetToken = await jwtServiceA.signAccessToken(targetAdmin.id, targetAdmin.token_version ?? 0, { role: 'admin' });
    await otpRedisA.setAuthState(rootAdmin.id, { role: 'admin', status: 'active', tokenVersion: rootAdmin.token_version ?? 0 });
    await otpRedisA.setAuthState(targetAdmin.id, { role: 'admin', status: 'active', tokenVersion: targetAdmin.token_version ?? 0 });

    // Step 3: Confirm the second administrator can access an admin-only endpoint
    const initialRes = await appA.inject({
      method: 'GET',
      url: '/admin/metrics',
      headers: { authorization: `Bearer ${targetToken}` },
    });
    expect(initialRes.statusCode).toBe(200);

    // Step 4: Use the first administrator to demote the second administrator to Job Seeker
    const demoteRes = await appA.inject({
      method: 'PUT',
      url: `/admin/users/${targetAdmin.id}/role`,
      headers: { authorization: `Bearer ${rootToken}` },
      payload: { role: 'job_seeker' },
    });
    expect(demoteRes.statusCode).toBe(200);

    // Step 5 & 6: Immediately reuse second administrator's existing JWT against same admin endpoint
            
    const immediateRes = await appA.inject({
      method: 'GET',
      url: '/admin/metrics',
      headers: { authorization: `Bearer ${targetToken}` },
    });
        // Request must NOT succeed because of stale cache; must return 401 (token_version mismatch)
    expect(immediateRes.statusCode).toBe(401);

    // Furthermore, a newly issued token reflecting the new job_seeker role returns 403 on admin-only route
    const updatedUser = await userRepoA.findById(targetAdmin.id);
    expect(updatedUser?.role).toBe('job_seeker');
    expect(updatedUser?.token_version).toBe((targetAdmin.token_version ?? 0) + 1);

    const freshJobSeekerToken = await jwtServiceA.signAccessToken(targetAdmin.id, updatedUser!.token_version, { role: 'job_seeker' });
    const forbiddenRes = await appA.inject({
      method: 'GET',
      url: '/admin/metrics',
      headers: { authorization: `Bearer ${freshJobSeekerToken}` },
    });
    expect(forbiddenRes.statusCode).toBe(403);
  });

  // Test 2: Account deactivation
  it('Test 2: Account deactivation immediately revokes access with HTTP 401 on existing JWT', async () => {
    const adminPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    const userPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);

    const admin = await userRepoA.create({ phone: adminPhone, role: 'admin', status: 'active' });
    const victim = await userRepoA.create({ phone: userPhone, role: 'employer', status: 'active' });

    const adminToken = await jwtServiceA.signAccessToken(admin.id, admin.token_version ?? 0, { role: 'admin' });
    const victimToken = await jwtServiceA.signAccessToken(victim.id, victim.token_version ?? 0);
    await otpRedisA.setAuthState(admin.id, { role: 'admin', status: 'active', tokenVersion: admin.token_version ?? 0 });
    await otpRedisA.setAuthState(victim.id, { role: 'employer', status: 'active', tokenVersion: victim.token_version ?? 0 });

    // Step 3: Confirm JWT works against authenticated endpoint
    const initialRes = await appA.inject({
      method: 'POST',
      url: '/auth/email/add',
      headers: { authorization: `Bearer ${victimToken}` },
      payload: { email: `init_${userPhone}@example.com` },
    });
    expect([200, 201]).toContain(initialRes.statusCode);

    // Step 4: Deactivate the account through administrative API
    const disableRes = await appA.inject({
      method: 'PUT',
      url: `/admin/users/${victim.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'disabled' },
    });
    expect(disableRes.statusCode).toBe(200);

    // Step 5 & 6: Immediately reuse existing JWT -> Assert HTTP 401 Unauthorized
    const immediateRes = await appA.inject({
      method: 'POST',
      url: '/auth/email/add',
      headers: { authorization: `Bearer ${victimToken}` },
      payload: { email: `disabled_${userPhone}@example.com` },
    });
    expect(immediateRes.statusCode).toBe(401);
  });

  // Test 3: Role transition
  it('Test 3: Role transitions (employer -> job_seeker -> employer) invalidate old JWTs immediately', async () => {
    const adminPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    const userPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);

    const admin = await userRepoA.create({ phone: adminPhone, role: 'admin', status: 'active' });
    const user = await userRepoA.create({ phone: userPhone, role: 'employer', status: 'active' });

    const adminToken = await jwtServiceA.signAccessToken(admin.id, admin.token_version ?? 0, { role: 'admin' });
    const empToken1 = await jwtServiceA.signAccessToken(user.id, user.token_version ?? 0, { role: 'employer' });
    await otpRedisA.setAuthState(user.id, { role: 'employer', status: 'active', tokenVersion: user.token_version ?? 0 });

    // Transition 1: employer -> job_seeker
    const transition1 = await appA.inject({
      method: 'PUT',
      url: `/admin/users/${user.id}/role`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'job_seeker' },
    });
    expect(transition1.statusCode).toBe(200);

    // Immediate request with empToken1 must be rejected (401)
    const res1 = await appA.inject({
      method: 'POST',
      url: '/auth/email/add',
      headers: { authorization: `Bearer ${empToken1}` },
      payload: { email: `t1_${userPhone}@example.com` },
    });
    expect(res1.statusCode).toBe(401);

    // User gets token 2 with job_seeker
    const u1 = await userRepoA.findById(user.id);
    const seekerToken = await jwtServiceA.signAccessToken(user.id, u1!.token_version, { role: 'job_seeker' });

    // Transition 2: job_seeker -> employer
    const transition2 = await appA.inject({
      method: 'PUT',
      url: `/admin/users/${user.id}/role`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'employer' },
    });
    expect(transition2.statusCode).toBe(200);

    // Immediate request with seekerToken must be rejected (401)
    const res2 = await appA.inject({
      method: 'POST',
      url: '/auth/email/add',
      headers: { authorization: `Bearer ${seekerToken}` },
      payload: { email: `t2_${userPhone}@example.com` },
    });
    expect(res2.statusCode).toBe(401);
  });

  // Test 4: Redis invalidation failure
  it('Test 4: Redis invalidation failure commits DB mutation, marks cache untrusted, and never allows stale privileges', async () => {
    const adminPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    const userPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);

    const admin = await userRepoA.create({ phone: adminPhone, role: 'admin', status: 'active' });
    const targetAdmin = await userRepoA.create({ phone: userPhone, role: 'admin', status: 'active' });

    const targetToken = await jwtServiceA.signAccessToken(targetAdmin.id, targetAdmin.token_version ?? 0, { role: 'admin' });
    // Populate Redis with stale admin auth state
    await otpRedisA.setAuthState(targetAdmin.id, { role: 'admin', status: 'active', tokenVersion: targetAdmin.token_version ?? 0 });

    // Simulate Redis invalidation failure during admin mutation
    const originalInvalidate = otpRedisA.invalidateUserSession.bind(otpRedisA);
    otpRedisA.invalidateUserSession = async (userId: string) => {
      otpRedisA.markUntrustedUser(userId);
      throw new Error('Simulated Redis network partition during cache invalidation');
    };

    try {
      // Execute role demotion
      const res = await adminServiceA.updateUserRole(targetAdmin.id, 'job_seeker', admin.id, 'Demotion under Redis fault');
      expect(res.role).toBe('job_seeker');

      // Verify 1: The database mutation is committed
      const updatedUser = await userRepoA.findById(targetAdmin.id);
      expect(updatedUser?.role).toBe('job_seeker');

      // Verify 2: The token-version increment is persisted in database
      expect(updatedUser?.token_version).toBe((targetAdmin.token_version ?? 0) + 1);

      // Verify 3: The failure is observable via untrusted marker and logger
      expect(otpRedisA.isUserCacheTrusted(targetAdmin.id)).toBe(false);

      // Verify 4: Subsequent authentication does NOT accept stale cached privileges
      // JwtAuthGuard detects untrusted cache, falls back to authoritative DB, sees token_version incremented, and rejects with 401!
      const postFaultAuthRes = await appA.inject({
        method: 'GET',
        url: '/admin/metrics',
        headers: { authorization: `Bearer ${targetToken}` },
      });
      expect(postFaultAuthRes.statusCode).toBe(401);

      // Verify 5: System fails closed when authoritative validation cannot be completed
      await otpRedisA.deleteAuthState(targetAdmin.id);
      otpRedisA.markUntrustedUser(targetAdmin.id);
      const originalFindById = userRepoA.findById.bind(userRepoA);
      userRepoA.findById = async () => {
        throw new Error('Database connection down');
      };

      try {
        const failClosedRes = await appA.inject({
          method: 'GET',
          url: '/admin/metrics',
          headers: { authorization: `Bearer ${targetToken}` },
        });
        expect(failClosedRes.statusCode).toBe(503);
      } finally {
        userRepoA.findById = originalFindById;
      }
    } finally {
      otpRedisA.invalidateUserSession = originalInvalidate;
      otpRedisA.clearUntrustedUser(targetAdmin.id);
    }
  });

  // Test 5: Session TTL
  it('Test 5: Session-state cache entries enforce a maximum TTL of 60 seconds', async () => {
    const testId = 'test_user_ttl_' + Date.now();
    const state = { role: 'job_seeker' as const, status: 'active' as const, tokenVersion: 1 };

    // Default call enforces 60s
    await otpRedisA.setAuthState(testId, state);
    const ttl1 = await otpRedisA.client.ttl('auth:state:' + testId);
    expect(ttl1).toBeGreaterThan(0);
    expect(ttl1).toBeLessThanOrEqual(AUTH_STATE_TTL_SECONDS);
    expect(ttl1).toBeLessThanOrEqual(60);

    // Caller attempting to pass 300s is capped to 60s
    await otpRedisA.setAuthState(testId, state, 300);
    const ttl2 = await otpRedisA.client.ttl('auth:state:' + testId);
    expect(ttl2).toBeGreaterThan(0);
    expect(ttl2).toBeLessThanOrEqual(60);

    await otpRedisA.deleteAuthState(testId);
  });

  // Test 6: Distributed multi-instance behavior
  it('Test 6: Mutation on instance B immediately rejects existing JWT on instance A', async () => {
    const adminPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    const userPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);

    const admin = await userRepoA.create({ phone: adminPhone, role: 'admin', status: 'active' });
    const targetUser = await userRepoA.create({ phone: userPhone, role: 'employer', status: 'active' });

    const adminToken = await jwtServiceA.signAccessToken(admin.id, admin.token_version ?? 0, { role: 'admin' });
    const userToken = await jwtServiceA.signAccessToken(targetUser.id, targetUser.token_version ?? 0, { role: 'employer' });

    // Step 1: Authenticate through instance A (seeds Redis)
    await otpRedisA.setAuthState(targetUser.id, { role: 'employer', status: 'active', tokenVersion: targetUser.token_version ?? 0 });
    const initialA = await appA.inject({
      method: 'POST',
      url: '/auth/email/add',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { email: `dist_${userPhone}@example.com` },
    });
    expect([200, 201]).toContain(initialA.statusCode);

    // Step 2: Perform administrative mutation through instance B
    const disableOnB = await appB.inject({
      method: 'PUT',
      url: `/admin/users/${targetUser.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'disabled' },
    });
    expect(disableOnB.statusCode).toBe(200);

    // Step 3 & 4: Reuse existing JWT against instance A -> Immediately rejected
    const replayOnA = await appA.inject({
      method: 'POST',
      url: '/auth/email/add',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { email: `replay_${userPhone}@example.com` },
    });
    expect(replayOnA.statusCode).toBe(401);
  });

  // Test 7: Cache key consistency
  it('Test 7: Invalidation targets the canonical Redis key schema (auth:state and auth:session)', async () => {
    const userId = 'usr_key_consistency_' + Date.now();
    const stateKey = `auth:state:${userId}`;
    const sessionKey = `auth:session:${userId}`;

    // Seed both keys
    await otpRedisA.client.set(stateKey, JSON.stringify({ role: 'employer', status: 'active', tokenVersion: 1 }));
    await otpRedisA.client.set(sessionKey, JSON.stringify({ id: userId, phone: '9876543210', role: 'employer', status: 'active' }));

    expect(await otpRedisA.client.get(stateKey)).not.toBeNull();
    expect(await otpRedisA.client.get(sessionKey)).not.toBeNull();

    // Call explicit invalidation
    await otpRedisA.invalidateUserSession(userId);

    // Assert both canonical keys are removed
    expect(await otpRedisA.client.get(stateKey)).toBeNull();
    expect(await otpRedisA.client.get(sessionKey)).toBeNull();
  });
});
