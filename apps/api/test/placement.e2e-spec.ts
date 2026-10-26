import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { PlacementService } from '../src/placement/placement.service.js';

describe('Ticket T-19: PlacementController (e2e) - INT-04', () => {
  let app: NestFastifyApplication;
  let placementService: PlacementService;

  const instHeaders = {
    authorization: 'Bearer jwt_session_inst-01_1792520000',
  };

  const empHeaders = {
    authorization: 'Bearer jwt_session_emp-01_1792520000',
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
    placementService = app.get(PlacementService);
  });

  beforeEach(() => {
    placementService.resetSeedData();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /placement/tie-ups - returns list of empanelled corporate MSME partners for authenticated institution', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/placement/tie-ups',
      headers: instHeaders,
    });

    expect(res.statusCode).toBe(200);
    const tieUps = JSON.parse(res.payload);
    expect(Array.isArray(tieUps)).toBe(true);
    expect(tieUps.length).toBeGreaterThan(0);
    expect(tieUps[0].companyName).toBeDefined();
    expect(tieUps[0].sector).toBeDefined();
    expect(tieUps[0].institutionId).toBe('inst-01');
  });

  it('POST /placement/tie-ups - empanels a new corporate MSME partner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/placement/tie-ups',
      headers: instHeaders,
      payload: {
        companyName: 'Tata Precision Tooling Ltd',
        sector: 'Precision Engineering & Tool Design',
        preferredTrades: ['CNC Machinist', 'Tool & Die Maker'],
        contactPerson: 'Suresh Patil (Head HR)',
      },
    });

    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.payload);
    expect(created.id).toBeDefined();
    expect(created.companyName).toBe('Tata Precision Tooling Ltd');
    expect(created.institutionId).toBe('inst-01');
    expect(created.partnershipStatus).toBe('mou_signed');
  });

  it('GET /placement/pipeline - returns live campus placement pipeline applications', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/placement/pipeline',
      headers: instHeaders,
    });

    expect(res.statusCode).toBe(200);
    const pipeline = JSON.parse(res.payload);
    expect(Array.isArray(pipeline)).toBe(true);
    expect(pipeline.length).toBeGreaterThan(0);
  });

  it('POST /placement/batch-share - dispatches candidate batch to partnered employer (Hard Invariant #1)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/placement/batch-share',
      headers: instHeaders,
      payload: {
        partnerId: 'tieup-01',
        driveSubject: '2026 Batch CNC Specialist Drive',
        studentIds: ['stu-batch-1', 'stu-batch-2'],
      },
    });

    expect(res.statusCode).toBe(201);
    const dispatched = JSON.parse(res.payload);
    expect(Array.isArray(dispatched)).toBe(true);
    expect(dispatched.length).toBe(2);
    expect(dispatched[0].stage).toBe('applied');

    // Hard Invariant #1 check: candidate phone/email are never included in API payload
    expect(JSON.stringify(dispatched)).not.toContain('phone');
    expect(JSON.stringify(dispatched)).not.toContain('email');
  });

  it('PATCH /placement/pipeline/:id/stage - advances candidate stage in pipeline with FSM validation', async () => {
    // Current app-pl-01 is in 'interview' stage and belongs to employer 'comp-01'
    const res = await app.inject({
      method: 'PATCH',
      url: '/placement/pipeline/app-pl-01/stage',
      headers: empHeaders,
      payload: {
        stage: 'offered',
        offerPackage: '₹3.4 LPA + Annual Incentive',
      },
    });

    expect(res.statusCode).toBe(200);
    const updated = JSON.parse(res.payload);
    expect(updated.id).toBe('app-pl-01');
    expect(updated.stage).toBe('offered');
    expect(updated.offerPackage).toBe('₹3.4 LPA + Annual Incentive');
  });
});
