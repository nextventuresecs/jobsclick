import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { RAZORPAY_GATEWAY, FakeRazorpayGateway } from '../src/wallet/razorpay.gateway.js';
import { PaymentService } from '../src/wallet/payment.service.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] && !process.env['DATABASE_URL'].includes('pooler.supabase.com')
    ? process.env['DATABASE_URL']
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('Sponsorship Endpoints E2E (WAL-05, INT-05, Quotes, Seat Capping, Attack Matrix)', () => {
  let app: NestFastifyApplication;
  let fakeGateway: FakeRazorpayGateway;
  let paymentService: PaymentService;
  let pgClient: pg.Client;

  beforeAll(async () => {
    pgClient = new pg.Client({ connectionString: DATABASE_URL });
    await pgClient.connect();

    fakeGateway = new FakeRazorpayGateway();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RAZORPAY_GATEWAY)
      .useValue(fakeGateway)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { rawBody: true },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    paymentService = app.get(PaymentService);
  });

  afterAll(async () => {
    await app.close();
    await pgClient.end();
  });

  beforeEach(() => {
    fakeGateway.clear();
  });

  async function createInstitution(name = 'Apex Technical Institute'): Promise<{ userId: string; institutionId: string }> {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const uRes = await pgClient.query(
      "INSERT INTO public.users (phone, role, status) VALUES ($1, 'intermediary', 'active') RETURNING id",
      [phone],
    );
    const userId = uRes.rows[0].id;

    const instRes = await pgClient.query(
      `INSERT INTO public.institution_profiles (user_id, institution_name, affiliation, city)
       VALUES ($1, $2, 'AICTE', 'New Delhi') RETURNING id`,
      [userId, name],
    );
    return {
      userId,
      institutionId: instRes.rows[0].id,
    };
  }

  async function createStudent(institutionId: string): Promise<string> {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const uRes = await pgClient.query(
      "INSERT INTO public.users (phone, role, status) VALUES ($1, 'job_seeker', 'active') RETURNING id",
      [phone],
    );
    const userId = uRes.rows[0].id;
    const pRes = await pgClient.query(
      `INSERT INTO public.job_seeker_profiles (user_id, full_name, city, institution_id)
       VALUES ($1, 'Student Candidate', 'New Delhi', $2) RETURNING id`,
      [userId, institutionId],
    );
    return pRes.rows[0].id;
  }

  it('GET /institution/sponsorship returns { status: "none" } when no active grant exists', async () => {
    const inst = await createInstitution('Alpha Polytechnic');

    const res = await app.inject({
      method: 'GET',
      url: `/institution/sponsorship?institutionId=${inst.institutionId}`,
      headers: {
        'x-user-id': inst.userId,
        'x-user-role': 'intermediary',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('none');
    expect(body.cap).toBe(0);
    expect(body.seatsUsed).toBe(0);
    expect(body.expiresAt).toBeNull();
  });

  it('GET /institution/sponsorship returns 404 when querying an institution owned by another user', async () => {
    const instA = await createInstitution('Inst A');
    const instB = await createInstitution('Inst B');

    const res = await app.inject({
      method: 'GET',
      url: `/institution/sponsorship?institutionId=${instA.institutionId}`,
      headers: {
        'x-user-id': instB.userId, // User B asks about Inst A
        'x-user-role': 'intermediary',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /institution/sponsorship/quote rejects non-owner with 404', async () => {
    const instA = await createInstitution('Inst A');
    const instB = await createInstitution('Inst B');

    const res = await app.inject({
      method: 'POST',
      url: '/institution/sponsorship/quote',
      headers: {
        'content-type': 'application/json',
        'x-user-id': instB.userId,
        'x-user-role': 'intermediary',
      },
      payload: {
        institutionId: instA.institutionId,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /institution/sponsorship/quote computes tier and fees, ignores client-supplied pricing', async () => {
    const inst = await createInstitution('Campus Beta');
    // Link 2 students
    await createStudent(inst.institutionId);
    await createStudent(inst.institutionId);

    // Client attempts to pass 1 student to get a cheaper rate
    const res = await app.inject({
      method: 'POST',
      url: '/institution/sponsorship/quote',
      headers: {
        'content-type': 'application/json',
        'x-user-id': inst.userId,
        'x-user-role': 'intermediary',
      },
      payload: {
        institutionId: inst.institutionId,
        declaredStudentCount: 1, // smaller than linked (2)
      },
    });

    expect(res.statusCode).toBe(201);
    const quote = res.json();
    // Server uses 2 students (larger of declared and linked)
    expect(quote.studentCount).toBe(2);
    expect(quote.tier).toBe('Small');
    expect(quote.ratePerStudentInr).toBe(150);
    expect(quote.baseAnnualFeeInr).toBe(300);
    expect(quote.gstAmountInr).toBe(54); // 18% of 300
    expect(quote.totalAnnualFeeInr).toBe(354);
  });

  it('POST /institution/sponsorship/create-order creates order with server snapshot', async () => {
    const inst = await createInstitution('Gamma College');
    await createStudent(inst.institutionId);
    await createStudent(inst.institutionId);

    const res = await app.inject({
      method: 'POST',
      url: '/institution/sponsorship/create-order',
      headers: {
        'content-type': 'application/json',
        'x-user-id': inst.userId,
        'x-user-role': 'intermediary',
      },
      payload: {
        institutionId: inst.institutionId,
        termsVersion: '2026.1',
        billingStateCode: '07',
        billingName: 'Gamma College Trust',
        billingGstin: '07AAAAA0000A1Z5',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.orderId).toBeDefined();
    expect(body.amount).toBe(35400); // 2 * 15000 + 18% = 35400 paise
    expect(body.quote.studentCap).toBe(2);
    expect(body.quote.tier).toBe('Small');

    // Verify DB payments row
    const payRows = await pgClient.query('SELECT * FROM public.payments WHERE gateway_order_id = $1', [body.orderId]);
    expect(payRows.rows.length).toBe(1);
    expect(payRows.rows[0].purpose).toBe('sponsorship');
    expect(payRows.rows[0].amount_paise).toBe('35400');
    expect(payRows.rows[0].status).toBe('created');
  });

  it('POST /institution/sponsorship/create-order rejects with 409 if active unexpired grant exists', async () => {
    const inst = await createInstitution('Delta Institute');

    // Create an active grant in database directly
    await pgClient.query(
      `INSERT INTO public.institution_sponsorships (
         institution_id, status, started_at, expires_at, tier, rate_paise,
         rate_per_student, annual_fee, student_cap, student_count, seats_used
       ) VALUES ($1, 'active', now(), now() + interval '365 days', 'Small', 15000, 150, 300, 2, 2, 0)`,
      [inst.institutionId],
    );

    const res = await app.inject({
      method: 'POST',
      url: '/institution/sponsorship/create-order',
      headers: {
        'content-type': 'application/json',
        'x-user-id': inst.userId,
        'x-user-role': 'intermediary',
      },
      payload: {
        institutionId: inst.institutionId,
        termsVersion: '2026.1',
        billingStateCode: '07',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('SPONSORSHIP_ALREADY_ACTIVE');
  });

  describe('Attack Matrix (Zero Grants Guaranteed)', () => {
    it('Attack 1: ₹590 wallet payment replayed against sponsorship order ID => AMOUNT_MISMATCH, zero grants', async () => {
      const inst = await createInstitution('Attack Inst 1');
      await createStudent(inst.institutionId);
      await createStudent(inst.institutionId);

      // Create sponsorship order expecting 35400 paise
      const orderRes = await app.inject({
        method: 'POST',
        url: '/institution/sponsorship/create-order',
        headers: {
          'content-type': 'application/json',
          'x-user-id': inst.userId,
          'x-user-role': 'intermediary',
        },
        payload: {
          institutionId: inst.institutionId,
          termsVersion: '2026.1',
          billingStateCode: '07',
        },
      });
      const orderId = orderRes.json().orderId;
      const paymentId = `pay_atk1_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

      // Attacker seeds ₹590 (59000 paise) wallet payment for this order
      fakeGateway.seedPayment({
        id: paymentId,
        orderId,
        status: 'captured',
        amountPaise: 59000, // Expected is 35400 paise
      });

      // Settle attempt
      const outcome = await paymentService.settleFromGateway(orderId, paymentId, 'attack_test');
      expect(outcome.status).toBe('amount_mismatch');

      // Verify ZERO sponsorship grants created
      const grants = await pgClient.query(
        'SELECT * FROM public.institution_sponsorships WHERE institution_id = $1',
        [inst.institutionId],
      );
      expect(grants.rows.length).toBe(0);
    });

    it('Attack 2: Another user\'s payment for a different institution => PRECONDITION_FAILED, zero grants', async () => {
      const instA = await createInstitution('Inst A');
      const instB = await createInstitution('Inst B');
      await createStudent(instA.institutionId);

      // Create order belonging to User B, but snapshot points to Inst A (tampered snapshot)
      const orderId = `order_atk2_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const paymentId = `pay_atk2_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

      await pgClient.query(
        `INSERT INTO public.payments (
           user_id, gateway_order_id, amount_paise, amount_inr, currency,
           purpose, credits_to_grant, status, order_snapshot
         ) VALUES ($1, $2, 17700, 177, 'INR', 'sponsorship', 0, 'created', $3)`,
        [
          instB.userId, // Payment belongs to User B
          orderId,
          JSON.stringify({ institutionId: instA.institutionId, studentCap: 1, ratePaise: 15000, totalPaise: 17700 }), // Points to Inst A
        ],
      );

      fakeGateway.seedPayment({
        id: paymentId,
        orderId,
        status: 'captured',
        amountPaise: 17700,
      });

      const outcome = await paymentService.settleFromGateway(orderId, paymentId, 'attack_test');
      expect(outcome.status).toBe('precondition_failed');

      // Zero grants created for Inst A or Inst B
      const grants = await pgClient.query(
        'SELECT * FROM public.institution_sponsorships WHERE institution_id IN ($1, $2)',
        [instA.institutionId, instB.institutionId],
      );
      expect(grants.rows.length).toBe(0);
    });

    it('Attack 3: Client passes forbidden fields (paymentReference, force, idempotencyKey) => 400 rejection', async () => {
      const inst = await createInstitution('Attack Inst 3');

      const res = await app.inject({
        method: 'POST',
        url: '/institution/sponsorship/create-order',
        headers: {
          'content-type': 'application/json',
          'x-user-id': inst.userId,
          'x-user-role': 'intermediary',
        },
        payload: {
          institutionId: inst.institutionId,
          termsVersion: '2026.1',
          billingStateCode: '07',
          paymentReference: 'dummy_pay_ref_override',
          force: true,
          idempotencyKey: 'idemp_key_bypass',
        },
      });

      expect(res.statusCode).toBe(400);

      const grants = await pgClient.query(
        'SELECT * FROM public.institution_sponsorships WHERE institution_id = $1',
        [inst.institutionId],
      );
      expect(grants.rows.length).toBe(0);
    });
  });
});
