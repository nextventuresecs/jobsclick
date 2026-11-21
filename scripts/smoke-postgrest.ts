import { createHmac } from 'crypto';

interface TestCase {
  name: string;
  url: string;
  method: string;
  token: string;
  body?: string;
  apiKey?: string;
  expectedStatus: number;
  payloadValidator?: (body: string, res?: Response) => boolean;
}

function base64url(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  return `${encodedHeader}.${encodedPayload}.${base64url(signature)}`;
}

const EXPECTED_PUBLIC_JOBS_COLUMNS = [
  'id',
  'employer_id',
  'title',
  'description',
  'category',
  'employment_type',
  'experience_level',
  'min_pay',
  'max_pay',
  'city',
  'district',
  'state',
  'openings',
  'skills',
  'expiry_date',
  'is_featured',
  'featured_until',
  'created_at',
].sort();

const FORBIDDEN_COLUMNS = ['fts', 'source', 'created_by', 'updated_by'];

async function getAuthenticatedToken(baseUrl: string, serviceKey: string, anonKey: string): Promise<{ token: string; cleanupUserId?: string }> {
  try {
    const testEmail = `smoke_auth_${Date.now()}@gmail.com`;
    const genRes = await fetch(`${baseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'magiclink',
        email: testEmail,
      }),
    });
    if (!genRes.ok) throw new Error(`generate_link failed: ${genRes.status}`);
    const genData = await genRes.json();

    const verRes = await fetch(`${baseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: genData.verification_type || 'signup',
        token: genData.email_otp,
        email: testEmail,
      }),
    });
    if (!verRes.ok) throw new Error(`verify failed: ${verRes.status}`);
    const verData = await verRes.json();
    return { token: verData.access_token, cleanupUserId: genData.id };
  } catch (err) {
    console.warn('[smoke] Note: Could not obtain dynamic GoTrue authenticated token, using signed JWT fallback:', (err as Error).message);
    const now = Math.floor(Date.now() / 1000);
    const fallback = signJwt({
      role: 'authenticated',
      sub: '00000000-0000-0000-0000-000000000002',
      iss: 'supabase',
      iat: now,
      exp: now + 3600,
    }, process.env['SUPABASE_JWT_SECRET'] || 'super-secret-jwt-token-with-at-least-32-characters-long');
    return { token: fallback };
  }
}

async function runSmokeTests() {
  const baseUrl = process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321';
  const restUrl = `${baseUrl}/rest/v1`;
  const SUPABASE_JWT_SECRET = process.env['SUPABASE_JWT_SECRET'] || 'super-secret-jwt-token-with-at-least-32-characters-long';
  const WRONG_JWT_SECRET = 'wrong-secret-key-that-does-not-match-at-all-abcdef';

  const now = Math.floor(Date.now() / 1000);

  const anonToken = process.env['SUPABASE_ANON_KEY'] || signJwt({
    role: 'anon',
    iss: 'supabase-demo',
    iat: now,
    exp: now + 3600,
  }, SUPABASE_JWT_SECRET);

  const serviceRoleToken = process.env['SUPABASE_SERVICE_ROLE_KEY'] || signJwt({
    role: 'service_role',
    iss: 'supabase-demo',
    iat: now,
    exp: now + 3600,
  }, SUPABASE_JWT_SECRET);

  const wrongSecretToken = signJwt({
    role: 'service_role',
    iss: 'supabase-demo',
    iat: now,
    exp: now + 3600,
  }, WRONG_JWT_SECRET);

  const { token: authenticatedToken, cleanupUserId } = await getAuthenticatedToken(baseUrl, serviceRoleToken, anonToken);

  console.log(`Starting PostgREST HTTP Smoke Verification against: ${restUrl}`);

  const testCases: TestCase[] = [
    // 1. Anon Base Table Denial (Exact 401)
    {
      name: '1. Anon Key -> Base Table (public.jobs) [Expect EXACT 401]',
      url: `${restUrl}/jobs?select=id`,
      method: 'GET',
      token: anonToken,
      expectedStatus: 401,
      payloadValidator: (body) => /permission denied|42501/i.test(body),
    },
    {
      name: '2. Anon Key -> Base Table (public.users) [Expect EXACT 401]',
      url: `${restUrl}/users?select=id`,
      method: 'GET',
      token: anonToken,
      expectedStatus: 401,
      payloadValidator: (body) => /permission denied|42501/i.test(body),
    },
    // 2. Authenticated JWT Base Table Denial (Exact 403)
    {
      name: '3. Authenticated JWT -> Base Table (public.jobs) [Expect EXACT 403]',
      url: `${restUrl}/jobs?select=id`,
      method: 'GET',
      token: authenticatedToken,
      expectedStatus: 403,
      payloadValidator: (body) => /permission denied for table jobs|42501/i.test(body),
    },
    {
      name: '4. Authenticated JWT -> Base Table (public.users) [Expect EXACT 403]',
      url: `${restUrl}/users?select=id`,
      method: 'GET',
      token: authenticatedToken,
      expectedStatus: 403,
      payloadValidator: (body) => /permission denied for table users|42501/i.test(body),
    },
    // 3. Public Views Allow (Exact 200 for anon and authenticated)
    {
      name: '5. Anon Key -> Public View (public_jobs) [Expect EXACT 200]',
      url: `${restUrl}/public_jobs?select=id`,
      method: 'GET',
      token: anonToken,
      expectedStatus: 200,
      payloadValidator: (body) => body.startsWith('['),
    },
    {
      name: '6. Authenticated JWT -> Public View (public_jobs) [Expect EXACT 200]',
      url: `${restUrl}/public_jobs?select=id`,
      method: 'GET',
      token: authenticatedToken,
      expectedStatus: 200,
      payloadValidator: (body) => body.startsWith('['),
    },
    {
      name: '7. Anon Key -> Public View (public_business_profiles) [Expect EXACT 200]',
      url: `${restUrl}/public_business_profiles?select=id`,
      method: 'GET',
      token: anonToken,
      expectedStatus: 200,
      payloadValidator: (body) => body.startsWith('['),
    },
    // 4. Invalid Signature Rejection (Exact 401)
    {
      name: '8. Wrong-Secret JWT -> Base Table (public.jobs) [Expect EXACT 401]',
      url: `${restUrl}/jobs?select=id`,
      method: 'GET',
      token: wrongSecretToken,
      expectedStatus: 401,
      payloadValidator: (body) => /invalid|jwt|unauthorized/i.test(body),
    },
    // 5. Service-Role Key Full Base Table Access (Exact 200)
    {
      name: '9. Service-Role Key -> Base Table (public.jobs) [Expect EXACT 200]',
      url: `${restUrl}/jobs?select=id`,
      method: 'GET',
      token: serviceRoleToken,
      expectedStatus: 200,
      payloadValidator: (body) => body.startsWith('['),
    },
    {
      name: '10. Service-Role Key -> Base Table (public.users) [Expect EXACT 200]',
      url: `${restUrl}/users?select=id`,
      method: 'GET',
      token: serviceRoleToken,
      expectedStatus: 200,
      payloadValidator: (body) => body.startsWith('['),
    },
    // 6. Definer RPC Lockdowns for Anon (Exact 401 - Never 404)
    {
      name: '11. Anon Key -> POST /rpc/grant_starter_credits [Expect EXACT 401, NOT 404]',
      url: `${restUrl}/rpc/grant_starter_credits`,
      method: 'POST',
      token: anonToken,
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
      expectedStatus: 401,
      payloadValidator: (body) => /permission denied|42501/i.test(body),
    },
    {
      name: '12. Anon Key -> POST /rpc/increment_token_version [Expect EXACT 401, NOT 404]',
      url: `${restUrl}/rpc/increment_token_version`,
      method: 'POST',
      token: anonToken,
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
      expectedStatus: 401,
      payloadValidator: (body) => /permission denied|42501/i.test(body),
    },
    {
      name: '13. Anon Key -> POST /rpc/anonymise_user [Expect EXACT 401, NOT 404]',
      url: `${restUrl}/rpc/anonymise_user`,
      method: 'POST',
      token: anonToken,
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
      expectedStatus: 401,
      payloadValidator: (body) => /permission denied|42501/i.test(body),
    },
    {
      name: '14. Anon Key -> POST /rpc/promote_job_with_ledger [Expect EXACT 401, NOT 404]',
      url: `${restUrl}/rpc/promote_job_with_ledger`,
      method: 'POST',
      token: anonToken,
      body: JSON.stringify({
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_job_id: '00000000-0000-0000-0000-000000000000',
        p_duration_days: 7,
        p_cost: 3,
      }),
      expectedStatus: 401,
      payloadValidator: (body) => /permission denied|42501/i.test(body),
    },
    {
      name: '15. Anon Key -> POST /rpc/unlock_contact_with_ledger [Expect EXACT 401, NOT 404]',
      url: `${restUrl}/rpc/unlock_contact_with_ledger`,
      method: 'POST',
      token: anonToken,
      body: JSON.stringify({
        p_employer_id: '00000000-0000-0000-0000-000000000000',
        p_seeker_id: '00000000-0000-0000-0000-000000000000',
        p_cost: 5,
      }),
      expectedStatus: 401,
      payloadValidator: (body) => /permission denied|42501/i.test(body),
    },
    // 7. Definer RPC Lockdowns for Authenticated JWT (Exact 403 - Never 404)
    {
      name: '16. Authenticated JWT -> POST /rpc/grant_starter_credits [Expect EXACT 403, NOT 404]',
      url: `${restUrl}/rpc/grant_starter_credits`,
      method: 'POST',
      token: authenticatedToken,
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000002' }),
      expectedStatus: 403,
      payloadValidator: (body) => /permission denied for function grant_starter_credits|42501/i.test(body),
    },
    {
      name: '17. Authenticated JWT -> POST /rpc/increment_token_version [Expect EXACT 403, NOT 404]',
      url: `${restUrl}/rpc/increment_token_version`,
      method: 'POST',
      token: authenticatedToken,
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000002' }),
      expectedStatus: 403,
      payloadValidator: (body) => /permission denied for function increment_token_version|42501/i.test(body),
    },
    {
      name: '18. Authenticated JWT -> POST /rpc/anonymise_user [Expect EXACT 403, NOT 404]',
      url: `${restUrl}/rpc/anonymise_user`,
      method: 'POST',
      token: authenticatedToken,
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000002' }),
      expectedStatus: 403,
      payloadValidator: (body) => /permission denied for function anonymise_user|42501/i.test(body),
    },
    {
      name: '19. Authenticated JWT -> POST /rpc/promote_job_with_ledger [Expect EXACT 403, NOT 404]',
      url: `${restUrl}/rpc/promote_job_with_ledger`,
      method: 'POST',
      token: authenticatedToken,
      body: JSON.stringify({
        p_user_id: '00000000-0000-0000-0000-000000000002',
        p_job_id: '00000000-0000-0000-0000-000000000000',
        p_duration_days: 7,
        p_cost: 3,
      }),
      expectedStatus: 403,
      payloadValidator: (body) => /permission denied for function promote_job_with_ledger|42501/i.test(body),
    },
    {
      name: '20. Authenticated JWT -> POST /rpc/unlock_contact_with_ledger [Expect EXACT 403, NOT 404]',
      url: `${restUrl}/rpc/unlock_contact_with_ledger`,
      method: 'POST',
      token: authenticatedToken,
      body: JSON.stringify({
        p_employer_id: '00000000-0000-0000-0000-000000000002',
        p_seeker_id: '00000000-0000-0000-0000-000000000000',
        p_cost: 5,
      }),
      expectedStatus: 403,
      payloadValidator: (body) => /permission denied for function unlock_contact_with_ledger|42501/i.test(body),
    },
    // 8. Service-Role Positive RPC Execution (Exact 200)
    {
      name: '21. Service-Role Key -> POST /rpc/get_user_credit_balance [Expect EXACT 200 Positive Execution]',
      url: `${restUrl}/rpc/get_user_credit_balance`,
      method: 'POST',
      token: serviceRoleToken,
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000001' }),
      expectedStatus: 200,
      payloadValidator: (body) => {
        try {
          const data = JSON.parse(body);
          return typeof data.balance === 'number';
        } catch {
          return false;
        }
      },
    },
    // 9. Exact Column Assertion on public_jobs (Exact 18 Columns, 0 Leaked)
    {
      name: '22. PostgREST OpenAPI Schema Cache -> public_jobs [Exact 18 Columns, 0 Leakage]',
      url: `${restUrl}/`,
      method: 'GET',
      token: serviceRoleToken,
      apiKey: serviceRoleToken,
      expectedStatus: 200,
      payloadValidator: (body) => {
        const spec = JSON.parse(body);
        const properties = spec.definitions?.public_jobs?.properties;
        if (!properties) return false;
        const exposedCols = Object.keys(properties).sort();
        const matchesExpected = JSON.stringify(exposedCols) === JSON.stringify(EXPECTED_PUBLIC_JOBS_COLUMNS);
        const leakedCols = FORBIDDEN_COLUMNS.filter((col) => col in properties);
        return matchesExpected && leakedCols.length === 0;
      },
    },
  ];

  let passedAll = true;

  console.log('\n======================================================');
  console.log('🌐 POSTGREST HTTP SMOKE RESULTS (EXACT STATUS CODE ASSERTS):');
  console.log('======================================================');

  for (const tc of testCases) {
    try {
      const res = await fetch(tc.url, {
        method: tc.method,
        headers: {
          apikey: tc.apiKey || anonToken,
          Authorization: `Bearer ${tc.token}`,
          'Content-Type': 'application/json',
        },
        body: tc.body,
      });

      const body = await res.text();
      const statusOk = res.status === tc.expectedStatus;
      const payloadOk = tc.payloadValidator ? tc.payloadValidator(body, res) : true;
      const passed = statusOk && payloadOk;

      if (!passed) passedAll = false;

      console.log(`${passed ? '✅' : '❌'} ${tc.name}`);
      console.log(`   HTTP Status: ${res.status} (Expected: ${tc.expectedStatus})`);
      if (!passed) {
        console.log(`   Response Body: ${body.substring(0, 200)}`);
      }
    } catch (err: unknown) {
      passedAll = false;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ ${tc.name} - Exception: ${msg}`);
    }
  }

  // Cleanup dynamic user if created
  if (cleanupUserId) {
    try {
      await fetch(`${baseUrl}/auth/v1/admin/users/${cleanupUserId}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleToken,
          Authorization: `Bearer ${serviceRoleToken}`,
        },
      });
    } catch {}
  }

  console.log('======================================================');
  if (passedAll) {
    console.log(`🎉 ALL POSTGREST HTTP SMOKE CHECKS PASSED (${testCases.length}/${testCases.length})!`);
    process.exit(0);
  } else {
    console.error('❌ SOME POSTGREST HTTP SMOKE CHECKS FAILED!');
    process.exit(1);
  }
}

runSmokeTests();
