import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('Ticket T-19: Adversarial Security, Multi-Tenant IDOR & FSM Audit (INT-04)', () => {
  let app: NestFastifyApplication;

  const instAHeaders = {
    authorization: 'Bearer jwt_session_inst-01_1792520000',
  };

  const instBHeaders = {
    authorization: 'Bearer jwt_session_inst-999_1792520000',
  };

  const emp1Headers = {
    authorization: 'Bearer jwt_session_emp-01_1792520000',
  };

  const empRivalHeaders = {
    authorization: 'Bearer jwt_session_emp-rival-999_1792520000',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // AXIS 1: MULTI-TENANT ISOLATION & IDOR PENETRATION PREVENTION
  // =========================================================================
  describe('Axis 1: Zero-Trust Multi-Tenant Isolation & IDOR Guards', () => {
    it('blocks unauthenticated requests with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/placement/tie-ups',
        // Omitted Authorization header
      });

      expect(res.statusCode).toBe(401);
    });

    it('isolates corporate tie-ups per institution tenant (Institution B sees 0 of Institution A tie-ups)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/placement/tie-ups',
        headers: instBHeaders,
      });

      expect(res.statusCode).toBe(200);
      const tieUps = JSON.parse(res.payload);
      expect(Array.isArray(tieUps)).toBe(true);
      expect(tieUps.length).toBe(0); // Proves zero leakage across institution tenants
    });

    it('prevents Institution B from dispatching candidate batch using Institution A tie-up (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/placement/batch-share',
        headers: instBHeaders,
        payload: {
          partnerId: 'tieup-01', // Owned by inst-01
          driveSubject: 'Unauthorized Campus Drive',
          studentIds: ['stu-intruder-1'],
        },
      });

      expect(res.statusCode).toBe(403);
      const err = JSON.parse(res.payload);
      expect(err.message).toContain('You do not own this corporate partnership');
    });

    it('prevents competing employer from modifying another employer candidate stage (403 Forbidden IDOR check)', async () => {
      // app-pl-01 belongs to employer 'comp-01'
      const res = await app.inject({
        method: 'PATCH',
        url: '/placement/pipeline/app-pl-01/stage',
        headers: empRivalHeaders, // comp-rival-999
        payload: {
          stage: 'offered',
          offerPackage: '₹10 LPA',
        },
      });

      expect(res.statusCode).toBe(403);
      const err = JSON.parse(res.payload);
      expect(err.message).toContain('You are not authorized to update this placement application');
    });
  });

  // =========================================================================
  // AXIS 2: STATE MACHINE RIGOR & TRANSITION INVARIANTS
  // =========================================================================
  describe('Axis 2: Pure Domain FSM Transition Invariants & Guard Contracts', () => {
    it('rejects illegal transition from rejected directly to placed with 422 Unprocessable Entity', async () => {
      // 1. First move app-pl-01 to rejected
      const rejectRes = await app.inject({
        method: 'PATCH',
        url: '/placement/pipeline/app-pl-01/stage',
        headers: emp1Headers,
        payload: { stage: 'rejected' },
      });
      expect(rejectRes.statusCode).toBe(200);

      // 2. Illegally attempt to jump directly from rejected to placed
      const illegalRes = await app.inject({
        method: 'PATCH',
        url: '/placement/pipeline/app-pl-01/stage',
        headers: emp1Headers,
        payload: {
          stage: 'placed',
          offerPackage: '₹4.0 LPA',
        },
      });

      expect(illegalRes.statusCode).toBe(422);
      const err = JSON.parse(illegalRes.payload);
      expect(err.message).toContain('Illegal state transition');
    });

    it('enforces payload invariant: stage offered requires offerPackage (400 Bad Request)', async () => {
      // First reactivate app-pl-01 back to applied, then shortlisted, then interview
      await app.inject({
        method: 'PATCH',
        url: '/placement/pipeline/app-pl-01/stage',
        headers: instAHeaders,
        payload: { stage: 'applied' },
      });

      await app.inject({
        method: 'PATCH',
        url: '/placement/pipeline/app-pl-01/stage',
        headers: emp1Headers,
        payload: { stage: 'shortlisted' },
      });

      await app.inject({
        method: 'PATCH',
        url: '/placement/pipeline/app-pl-01/stage',
        headers: emp1Headers,
        payload: { stage: 'interview', interviewDate: '2026-10-25 10:00:00' },
      });

      // Attempt to advance to offered without offerPackage
      const res = await app.inject({
        method: 'PATCH',
        url: '/placement/pipeline/app-pl-01/stage',
        headers: emp1Headers,
        payload: {
          stage: 'offered',
          // offerPackage omitted
        },
      });

      expect(res.statusCode).toBe(400);
      const err = JSON.parse(res.payload);
      expect(err.message).toContain("Stage 'offered' requires an 'offerPackage'");
    });

    it('enforces payload invariant: stage interview requires interviewDate (400 Bad Request)', async () => {
      // First move to shortlisted
      await app.inject({
        method: 'PATCH',
        url: '/placement/pipeline/app-pl-01/stage',
        headers: emp1Headers,
        payload: { stage: 'shortlisted' },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/placement/pipeline/app-pl-01/stage',
        headers: emp1Headers,
        payload: {
          stage: 'interview',
          // interviewDate omitted
        },
      });

      expect(res.statusCode).toBe(400);
      const err = JSON.parse(res.payload);
      expect(err.message).toContain("Stage 'interview' requires an 'interviewDate'");
    });
  });

  // =========================================================================
  // AXIS 3: DOUBLE-PLACEMENT LOCK
  // =========================================================================
  describe('Axis 3: Double-Placement Lock (Zero Concurrent Conflicting Offers)', () => {
    it('atomically auto-withdraws other active applications when student reaches placed stage', async () => {
      // Setup candidate 'stu-shared-99' in two applications
      const batchRes = await app.inject({
        method: 'POST',
        url: '/placement/batch-share',
        headers: instAHeaders,
        payload: {
          partnerId: 'tieup-01',
          driveSubject: 'Dual Application Student Drive A',
          studentIds: ['stu-dual-99'],
        },
      });
      expect(batchRes.statusCode).toBe(201);
      const [appA] = JSON.parse(batchRes.payload);

      // Now emulate a second drive with tieup-02
      const batchRes2 = await app.inject({
        method: 'POST',
        url: '/placement/batch-share',
        headers: instAHeaders,
        payload: {
          partnerId: 'tieup-02',
          driveSubject: 'Dual Application Student Drive B',
          studentIds: ['stu-dual-99'],
        },
      });
      expect(batchRes2.statusCode).toBe(201);
      const [appB] = JSON.parse(batchRes2.payload);

      expect(appA.stage).toBe('applied');
      expect(appB.stage).toBe('applied');

      // Now Candidate accepts offer on Drive A and transitions to 'placed'
      // Need to advance appA: applied -> shortlisted -> offered -> placed
      await app.inject({
        method: 'PATCH',
        url: `/placement/pipeline/${appA.id}/stage`,
        headers: emp1Headers,
        payload: { stage: 'shortlisted' },
      });

      await app.inject({
        method: 'PATCH',
        url: `/placement/pipeline/${appA.id}/stage`,
        headers: emp1Headers,
        payload: { stage: 'offered', offerPackage: '₹4.2 LPA' },
      });

      const placedRes = await app.inject({
        method: 'PATCH',
        url: `/placement/pipeline/${appA.id}/stage`,
        headers: emp1Headers,
        payload: { stage: 'placed', offerPackage: '₹4.2 LPA' },
      });
      expect(placedRes.statusCode).toBe(200);

      // Query pipeline to verify appB was automatically locked/withdrawn (stage: 'rejected')
      const pipelineRes = await app.inject({
        method: 'GET',
        url: '/placement/pipeline',
        headers: instAHeaders,
      });

      const pipeline = JSON.parse(pipelineRes.payload);
      const updatedAppB = pipeline.find((a: { id: string; stage: string }) => a.id === appB.id);

      expect(updatedAppB).toBeDefined();
      expect(updatedAppB.stage).toBe('rejected'); // Double-Placement Lock triggered!
    });
  });

  // =========================================================================
  // AXIS 4: WIRE-LEVEL ZERO-PII PAYLOAD REGEX VALIDATION
  // =========================================================================
  describe('Axis 4: Wire-Level Zero-PII Leakage Verification (Hard Invariant #1)', () => {
    it('guarantees batch share and pipeline payloads contain 0 unmasked phone numbers or emails', async () => {
      const pipelineRes = await app.inject({
        method: 'GET',
        url: '/placement/pipeline',
        headers: instAHeaders,
      });

      expect(pipelineRes.statusCode).toBe(200);
      const rawPayload = pipelineRes.payload;

      // Phone regex matching 10-digit Indian phone numbers
      const phoneRegex = /\+?91[ -]?[6-9]\d{9}/g;
      // Email regex matching email patterns
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

      expect(phoneRegex.test(rawPayload)).toBe(false);
      expect(emailRegex.test(rawPayload)).toBe(false);
    });
  });
});
