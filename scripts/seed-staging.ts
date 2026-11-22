import type { ClientConfig } from 'pg';
import pg from 'pg';
const { Client } = pg;
import fs from 'node:fs';
import path from 'node:path';

export type AppEnv = 'production' | 'staging' | 'test' | 'development';

export function getAppEnv(source?: Record<string, string | undefined>): AppEnv {
  const envSource = source ?? (typeof process !== 'undefined' ? process.env : {});
  const rawAppEnv = envSource['APP_ENV'] || envSource['NEXT_PUBLIC_APP_ENV'];
  const rawNodeEnv = envSource['NODE_ENV'];

  const normAppEnv = rawAppEnv !== undefined && rawAppEnv !== null ? rawAppEnv.trim().toLowerCase() : '';
  const normNodeEnv = rawNodeEnv !== undefined && rawNodeEnv !== null ? rawNodeEnv.trim().toLowerCase() : '';

  if (normAppEnv === 'production' && (normNodeEnv === 'staging' || normNodeEnv === 'test')) {
    throw new Error(
      `Conflicting environment configuration: APP_ENV=production cannot be combined with NODE_ENV=${normNodeEnv}`
    );
  }

  const candidate =
    normAppEnv !== ''
      ? normAppEnv
      : normNodeEnv !== ''
        ? normNodeEnv
        : '';

  if (candidate === 'staging') return 'staging';
  if (candidate === 'test') return 'test';
  if (candidate === 'development' || candidate === 'dev') return 'development';
  return 'production';
}

export const TARGET_STAGING_PROJECT_REF = 'afxgvtfaofpnlhdsexnp';
export const FORBIDDEN_OLD_PROJECT_REF = 'aspahsnclunutwiqliau';

export interface SeedOptions {
  connectionString?: string;
  confirmedProjectRef?: string;
  dryRun?: boolean;
  stagingProjectRef?: string;
  env?: Record<string, string | undefined>;
}

export interface SeedSummary {
  usersUpserted: number;
  institutionProfilesUpserted: number;
  studentsUpserted: number;
  businessProfilesUpserted: number;
  jobsUpserted: number;
  applicationsUpserted: number;
}

export interface ValidatedSeedConfig {
  clientConfig: ClientConfig;
  targetRef: string;
  seedPhones: Record<string, string>;
  allowlist: string[];
  isDryRun: boolean;
}

export const REQUIRED_SEED_ROLES = [
  'admin',
  'msme_admin',
  'intermediary',
  'employer',
  'job_seeker',
] as const;

export type RequiredSeedRole = (typeof REQUIRED_SEED_ROLES)[number];

export function validateSeedGuards(options: SeedOptions = {}): ValidatedSeedConfig {
  const env = options.env || process.env;

  // 1. Refuse when APP_ENV/NODE_ENV resolves to production
  const normAppEnv = (env['APP_ENV'] || env['NEXT_PUBLIC_APP_ENV'] || '').trim().toLowerCase();
  const normNodeEnv = (env['NODE_ENV'] || '').trim().toLowerCase();

  if (normAppEnv === 'production' && (normNodeEnv === 'staging' || normNodeEnv === 'test')) {
    throw new Error(
      `Conflicting environment configuration: APP_ENV=production cannot be combined with NODE_ENV=${normNodeEnv}`
    );
  }

  const resolvedEnv = getAppEnv(env);
  if (resolvedEnv === 'production' || normAppEnv === 'production' || normNodeEnv === 'production') {
    throw new Error(
      'SECURITY ABORT: Staging seed script cannot run when APP_ENV/NODE_ENV resolves to production.'
    );
  }

  // 2. Resolve expected target project ref
  const expectedRef = (
    options.stagingProjectRef ||
    env['STAGING_PROJECT_REF'] ||
    TARGET_STAGING_PROJECT_REF
  ).trim();

  // 3. Database URL and project ref guards
  let rawUrl = (
    options.connectionString ||
    env['STAGING_DATABASE_URL'] ||
    env['DATABASE_URL'] ||
    ''
  ).trim();

  if ((rawUrl.startsWith('"') && rawUrl.endsWith('"')) || (rawUrl.startsWith("'") && rawUrl.endsWith("'"))) {
    rawUrl = rawUrl.slice(1, -1);
  }

  if (!rawUrl) {
    throw new Error('Missing target database connection string (STAGING_DATABASE_URL or DATABASE_URL).');
  }

  // Refuse if connection string contains forbidden old project ref
  if (rawUrl.includes(FORBIDDEN_OLD_PROJECT_REF)) {
    throw new Error(
      `SECURITY ABORT: Connection string references deprecated/forbidden staging project ref "${FORBIDDEN_OLD_PROJECT_REF}". Target staging project ref must be "${expectedRef}".`
    );
  }

  // Require --confirm-project-ref <ref> matching expected target ref
  const confirmedRef = options.confirmedProjectRef?.trim();
  if (!confirmedRef) {
    throw new Error(
      `SECURITY CONFIRMATION REQUIRED: You must explicitly provide --confirm-project-ref ${expectedRef} to proceed.`
    );
  }
  if (confirmedRef !== expectedRef) {
    throw new Error(
      `SECURITY ABORT: Confirmed project ref "${confirmedRef}" does not match target staging project ref "${expectedRef}".`
    );
  }

  // Parse connection URL
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const protoMatch = rawUrl.match(/^([^:]+):\/\//);
    if (protoMatch) {
      const scheme = protoMatch[1];
      const remainder = rawUrl.slice(protoMatch[0].length);
      const atIdx = remainder.lastIndexOf('@');
      if (atIdx !== -1) {
        const auth = remainder.slice(0, atIdx);
        const hostPath = remainder.slice(atIdx + 1);
        const colonIdx = auth.indexOf(':');
        if (colonIdx !== -1) {
          const user = auth.slice(0, colonIdx);
          const rawPass = auth.slice(colonIdx + 1);
          parsed = new URL(`${scheme}://${user}:${encodeURIComponent(rawPass)}@${hostPath}`);
        } else {
          throw new Error('Invalid database URL format');
        }
      } else {
        throw new Error('Invalid database URL format');
      }
    } else {
      throw new Error('Invalid database URL format');
    }
  }

  const host = parsed.hostname;
  const port = parseInt(parsed.port || '5432', 10);
  const username = decodeURIComponent(parsed.username);

  if (
    host.includes(FORBIDDEN_OLD_PROJECT_REF) ||
    username.includes(FORBIDDEN_OLD_PROJECT_REF)
  ) {
    throw new Error(
      `SECURITY ABORT: Connection string references deprecated/forbidden staging project ref "${FORBIDDEN_OLD_PROJECT_REF}". Target staging project ref must be "${expectedRef}".`
    );
  }

  // Refuse unless target host/ref matches STAGING_PROJECT_REF
  const isDirectAllowed = host === `db.${expectedRef}.supabase.co`;
  const isPoolerAllowed = host.endsWith('.pooler.supabase.com') && username === `postgres.${expectedRef}`;
  const matchesTargetRef = isDirectAllowed || isPoolerAllowed || host.includes(expectedRef) || username.includes(expectedRef);

  if (!matchesTargetRef) {
    throw new Error(
      `SECURITY ABORT: Target host/ref "${host}" does not match expected staging project ref "${expectedRef}". Target must be db.${expectedRef}.supabase.co or staging session pooler.`
    );
  }

  // Reject transaction pooler port 6543
  if (port === 6543) {
    throw new Error(
      'CONFIGURATION ERROR: Port 6543 is a transaction-mode PgBouncer/Supavisor pooler. Please connect via session pooler or direct connection on port 5432.'
    );
  }

  // 4. TLS Configuration (Same TLS rules as bootstrap-staging-db.ts)
  const isLocalHost = host === '127.0.0.1' || host === 'localhost';
  const isStrict = resolvedEnv !== 'development' && resolvedEnv !== 'test';

  if (isStrict && env['DB_ALLOW_INSECURE_TLS'] === 'true') {
    throw new Error('FATAL: DB_ALLOW_INSECURE_TLS is forbidden in production/staging.');
  }

  let sslConfig: boolean | { rejectUnauthorized: boolean; ca?: string } = false;
  if (!isLocalHost) {
    let caCert: string | undefined;
    const caPathOrValue = env['SUPABASE_CA_CERT'];
    if (caPathOrValue) {
      if (fs.existsSync(caPathOrValue)) {
        caCert = fs.readFileSync(caPathOrValue, 'utf8');
      } else if (caPathOrValue.includes('BEGIN CERTIFICATE')) {
        caCert = caPathOrValue;
      }
    }

    sslConfig = {
      rejectUnauthorized: true,
      ...(caCert ? { ca: caCert } : {}),
    };
  }

  // 5. STAGING_SMS_ALLOWLIST validation
  const rawAllowlist = env['STAGING_SMS_ALLOWLIST'] || '';
  const allowlist = rawAllowlist
    .split(',')
    .map((s) => s.trim().replace(/\D/g, '').slice(-10))
    .filter((s) => s.length === 10);

  if (allowlist.length === 0) {
    throw new Error(
      'SECURITY ABORT: STAGING_SMS_ALLOWLIST is empty. Cannot seed test accounts without an active SMS allowlist.'
    );
  }

  // 6. STAGING_SEED_PHONES validation
  const rawSeedPhones = env['STAGING_SEED_PHONES'];
  if (!rawSeedPhones) {
    throw new Error('Missing STAGING_SEED_PHONES environment variable.');
  }

  let seedPhones: Record<string, string>;
  try {
    seedPhones = typeof rawSeedPhones === 'string' ? JSON.parse(rawSeedPhones) : rawSeedPhones;
  } catch {
    throw new Error('STAGING_SEED_PHONES must be a valid JSON object mapping roles to 10-digit phone numbers.');
  }

  if (typeof seedPhones !== 'object' || seedPhones === null) {
    throw new Error('STAGING_SEED_PHONES must be a valid JSON object.');
  }

  // Verify all required roles exist
  for (const role of REQUIRED_SEED_ROLES) {
    const val = seedPhones[role] || (role === 'intermediary' ? seedPhones['institution'] : undefined);
    if (!val) {
      throw new Error(`STAGING_SEED_PHONES missing required role: "${role}".`);
    }
  }

  // Verify every phone is a valid 10-digit number and exists in STAGING_SMS_ALLOWLIST
  for (const [roleKey, phoneRaw] of Object.entries(seedPhones)) {
    const cleanPhone = String(phoneRaw).replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      throw new Error(
        `Invalid 10-digit Indian mobile number for role "${roleKey}". Phone numbers must match ^[6-9][0-9]{9}$.`
      );
    }
    if (!allowlist.includes(cleanPhone)) {
      throw new Error(
        `SECURITY ABORT: Seed phone for "${roleKey}" is not in STAGING_SMS_ALLOWLIST.`
      );
    }
  }

  const clientConfig: ClientConfig = {
    connectionString: parsed.toString(),
    host,
    port,
    user: username,
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1) || 'postgres',
    ssl: sslConfig,
    statement_timeout: 30000,
    query_timeout: 30000,
    connectionTimeoutMillis: 10000,
  };

  return {
    clientConfig,
    targetRef: expectedRef,
    seedPhones,
    allowlist,
    isDryRun: options.dryRun ?? false,
  };
}

export async function runSeedStaging(options: SeedOptions = {}): Promise<SeedSummary> {
  const isCliDryRun = process.argv.includes('--dry-run');
  const confirmArgIdx = process.argv.indexOf('--confirm-project-ref');
  const cliConfirmedRef = confirmArgIdx !== -1 ? process.argv[confirmArgIdx + 1] : undefined;

  const resolvedOptions: SeedOptions = {
    ...options,
    dryRun: options.dryRun ?? isCliDryRun,
    confirmedProjectRef: options.confirmedProjectRef || cliConfirmedRef,
  };

  const validated = validateSeedGuards(resolvedOptions);

  console.log('========================================================================');
  console.log('🌱 STAGING DATABASE SEED RUNNER (Manual Testing Fixtures)');
  console.log(`Target Project Ref: ${validated.targetRef}`);
  console.log(`Host: ${validated.clientConfig.host}:${validated.clientConfig.port}`);
  console.log(`Dry-Run: ${validated.isDryRun ? 'YES (No database writes)' : 'NO (Live Execution)'}`);
  console.log('========================================================================\n');

  if (validated.isDryRun) {
    console.log('ℹ️  [DRY RUN] All guards validated successfully.');
    console.log('ℹ️  [DRY RUN] Planned fixture creation:');
    console.log('    - Users: 5 test accounts across required roles');
    console.log('    - Institution profile: 1 (is_published: true)');
    console.log('    - Students: 5 linked candidates');
    console.log('    - Business profile: 1');
    console.log('    - Jobs: 4 (2 active, 1 expired, 1 inactive)');
    console.log('    - Applications: 4');
    console.log('\n======================================================');
    console.log('📊 SUMMARY OF SEEDED ROWS (DRY RUN):');
    console.log('======================================================');
    console.log('- Users: 5');
    console.log('- Institution profiles: 1');
    console.log('- Students: 5');
    console.log('- Business profiles: 1');
    console.log('- Jobs: 4 (2 active, 1 expired, 1 inactive)');
    console.log('- Applications: 4');
    console.log('======================================================\n');

    return {
      usersUpserted: 5,
      institutionProfilesUpserted: 1,
      studentsUpserted: 5,
      businessProfilesUpserted: 1,
      jobsUpserted: 4,
      applicationsUpserted: 4,
    };
  }

  const client = new Client(validated.clientConfig);
  await client.connect();

  try {
    await client.query('BEGIN;');

    // 1. Idempotently upsert test users by phone
    const userRoleMapping: Record<RequiredSeedRole, string> = {
      admin: validated.seedPhones['admin'],
      msme_admin: validated.seedPhones['msme_admin'],
      intermediary: validated.seedPhones['intermediary'] || validated.seedPhones['institution'],
      employer: validated.seedPhones['employer'],
      job_seeker: validated.seedPhones['job_seeker'],
    };

    const userMap = new Map<string, string>(); // role -> userId
    let usersUpserted = 0;

    for (const [role, phone] of Object.entries(userRoleMapping)) {
      const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
      const res = await client.query<{ id: string }>(
        `INSERT INTO public.users (phone, role, status, source)
         VALUES ($1, $2, 'active', 'staging_seed')
         ON CONFLICT (phone) DO UPDATE 
         SET role = EXCLUDED.role, status = 'active', source = 'staging_seed'
         RETURNING id;`,
        [cleanPhone, role]
      );
      if (res.rows[0]) {
        userMap.set(role, res.rows[0].id);
        usersUpserted++;
      }
    }

    const intermediaryUserId = userMap.get('intermediary')!;
    const employerUserId = userMap.get('employer')!;
    const jobSeekerUserId = userMap.get('job_seeker')!;

    // 2. Institution Profile (is_published: true)
    let institutionProfilesUpserted = 0;
    const existingInstRes = await client.query<{ id: string }>(
      'SELECT id FROM public.institution_profiles WHERE user_id = $1;',
      [intermediaryUserId]
    );

    let institutionProfileId: string;
    if (existingInstRes.rows.length > 0) {
      institutionProfileId = existingInstRes.rows[0].id;
      await client.query(
        `UPDATE public.institution_profiles
         SET institution_name = 'Staging Technical Institute',
             is_published = true,
             affiliation = 'NCVT',
             city = 'New Delhi',
             state = 'Delhi',
             district = 'South Delhi',
             source = 'staging_seed'
         WHERE id = $1;`,
        [institutionProfileId]
      );
      institutionProfilesUpserted++;
    } else {
      const insertInstRes = await client.query<{ id: string }>(
        `INSERT INTO public.institution_profiles (
           user_id, institution_name, is_published, affiliation, city, state, district, source
         ) VALUES (
           $1, 'Staging Technical Institute', true, 'NCVT', 'New Delhi', 'Delhi', 'South Delhi', 'staging_seed'
         ) RETURNING id;`,
        [intermediaryUserId]
      );
      institutionProfileId = insertInstRes.rows[0].id;
      institutionProfilesUpserted++;
    }

    // 3. 5 Students linked to the institution profile
    const studentFakeNames = [
      'Candidate Aarav Sharma',
      'Candidate Vivaan Patel',
      'Candidate Aditya Verma',
      'Candidate Vihaan Singh',
      'Candidate Arjun Gupta',
    ];

    // Assign student profiles to distinct seeded test accounts so all linked user IDs are valid and allowlisted
    const candidateUserIds = [
      jobSeekerUserId,
      intermediaryUserId,
      userMap.get('admin')!,
      userMap.get('msme_admin')!,
      employerUserId,
    ];

    let studentsUpserted = 0;
    const seededStudentProfileIds: string[] = [];

    for (let i = 0; i < studentFakeNames.length; i++) {
      const name = studentFakeNames[i];
      const linkedUserId = candidateUserIds[i];

      const existingStudentRes = await client.query<{ id: string }>(
        'SELECT id FROM public.job_seeker_profiles WHERE institution_id = $1 AND full_name = $2;',
        [institutionProfileId, name]
      );

      if (existingStudentRes.rows.length > 0) {
        const studentId = existingStudentRes.rows[0].id;
        await client.query(
          `UPDATE public.job_seeker_profiles
           SET user_id = $1,
               seeker_type = 'student',
               city = 'New Delhi',
               state = 'Delhi',
               district = 'South Delhi',
               source = 'staging_seed'
           WHERE id = $2;`,
          [linkedUserId, studentId]
        );
        seededStudentProfileIds.push(studentId);
        studentsUpserted++;
      } else {
        const insertStudentRes = await client.query<{ id: string }>(
          `INSERT INTO public.job_seeker_profiles (
             user_id, institution_id, full_name, seeker_type, city, state, district, source
           ) VALUES (
             $1, $2, $3, 'student', 'New Delhi', 'Delhi', 'South Delhi', 'staging_seed'
           ) RETURNING id;`,
          [linkedUserId, institutionProfileId, name]
        );
        seededStudentProfileIds.push(insertStudentRes.rows[0].id);
        studentsUpserted++;
      }
    }

    // 4. Business Profile
    let businessProfilesUpserted = 0;
    const existingBizRes = await client.query<{ id: string }>(
      'SELECT id FROM public.business_profiles WHERE user_id = $1;',
      [employerUserId]
    );

    if (existingBizRes.rows.length > 0) {
      await client.query(
        `UPDATE public.business_profiles
         SET company_name = 'Staging Precision Works Pvt Ltd',
             ownership_type = 'Private Limited',
             company_size = '50-200',
             sector = 'Manufacturing',
             city = 'New Delhi',
             district = 'South Delhi',
             source = 'staging_seed'
         WHERE id = $1;`,
        [existingBizRes.rows[0].id]
      );
      businessProfilesUpserted++;
    } else {
      await client.query(
        `INSERT INTO public.business_profiles (
           user_id, company_name, ownership_type, company_size, sector, city, district, source
         ) VALUES (
           $1, 'Staging Precision Works Pvt Ltd', 'Private Limited', '50-200', 'Manufacturing', 'New Delhi', 'South Delhi', 'staging_seed'
         );`,
        [employerUserId]
      );
      businessProfilesUpserted++;
    }

    // 5. Jobs: 2 active, 1 expired, 1 inactive
    const jobFixtures = [
      {
        title: 'Staging CNC Machine Operator (Active)',
        description: 'Operation of automated CNC milling machines and precision measurement.',
        category: 'blue',
        city: 'New Delhi',
        openings: 3,
        isActive: true,
        expiryInterval: "INTERVAL '30 days'",
      },
      {
        title: 'Staging Industrial Electrician (Active)',
        description: 'Maintenance of industrial switchgear, motor drives and wiring.',
        category: 'blue',
        city: 'New Delhi',
        openings: 2,
        isActive: true,
        expiryInterval: "INTERVAL '45 days'",
      },
      {
        title: 'Staging Inventory Associate (Expired)',
        description: 'Warehouse tracking, pallet staging and inventory verification.',
        category: 'grey',
        city: 'New Delhi',
        openings: 1,
        isActive: true,
        expiryInterval: "- INTERVAL '10 days'", // expired
      },
      {
        title: 'Staging Operations Assistant (Inactive)',
        description: 'Shift scheduling, documentation and office coordination.',
        category: 'white',
        city: 'New Delhi',
        openings: 1,
        isActive: false, // inactive
        expiryInterval: "INTERVAL '30 days'",
      },
    ];

    let jobsUpserted = 0;
    const seededJobIds: string[] = [];

    for (const j of jobFixtures) {
      const existingJobRes = await client.query<{ id: string }>(
        'SELECT id FROM public.jobs WHERE employer_id = $1 AND title = $2;',
        [employerUserId, j.title]
      );

      if (existingJobRes.rows.length > 0) {
        const jobId = existingJobRes.rows[0].id;
        await client.query(
          `UPDATE public.jobs
           SET description = $1,
               category = $2,
               city = $3,
               openings = $4,
               is_active = $5,
               expiry_date = NOW() + ${j.expiryInterval},
               source = 'staging_seed'
           WHERE id = $6;`,
          [j.description, j.category, j.city, j.openings, j.isActive, jobId]
        );
        seededJobIds.push(jobId);
        jobsUpserted++;
      } else {
        const insertJobRes = await client.query<{ id: string }>(
          `INSERT INTO public.jobs (
             employer_id, title, description, category, city, openings, is_active, expiry_date, source
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, NOW() + ${j.expiryInterval}, 'staging_seed'
           ) RETURNING id;`,
          [employerUserId, j.title, j.description, j.category, j.city, j.openings, j.isActive]
        );
        seededJobIds.push(insertJobRes.rows[0].id);
        jobsUpserted++;
      }
    }

    // 6. Handful of applications
    let applicationsUpserted = 0;
    if (seededJobIds.length >= 2) {
      const applicationSpecs = [
        { jobId: seededJobIds[0], applicantId: jobSeekerUserId, status: 'applied' },
        { jobId: seededJobIds[1], applicantId: jobSeekerUserId, status: 'shortlisted' },
        { jobId: seededJobIds[0], applicantId: intermediaryUserId, status: 'interview_scheduled' },
        { jobId: seededJobIds[1], applicantId: userMap.get('admin')!, status: 'hired' },
      ];

      for (const app of applicationSpecs) {
        await client.query(
          `INSERT INTO public.applications (job_id, applicant_id, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (job_id, applicant_id) DO UPDATE
           SET status = EXCLUDED.status;`,
          [app.jobId, app.applicantId, app.status]
        );
        applicationsUpserted++;
      }
    }

    await client.query('COMMIT;');

    console.log('======================================================');
    console.log('📊 SUMMARY OF SEEDED ROWS:');
    console.log('======================================================');
    console.log(`- Users: ${usersUpserted}`);
    console.log(`- Institution profiles: ${institutionProfilesUpserted}`);
    console.log(`- Students: ${studentsUpserted}`);
    console.log(`- Business profiles: ${businessProfilesUpserted}`);
    console.log(`- Jobs: ${jobsUpserted} (2 active, 1 expired, 1 inactive)`);
    console.log(`- Applications: ${applicationsUpserted}`);
    console.log('======================================================\n');

    return {
      usersUpserted,
      institutionProfilesUpserted,
      studentsUpserted,
      businessProfilesUpserted,
      jobsUpserted,
      applicationsUpserted,
    };
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    await client.end();
  }
}

// CLI Execution Entry Point
if (process.argv[1] && /seed-staging(\.ts)?$/.test(process.argv[1].replace(/\\/g, '/'))) {
  runSeedStaging()
    .then(() => {
      console.log('✅ Staging database seed completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Staging database seed failed:', (err as Error).message);
      process.exit(1);
    });
}
