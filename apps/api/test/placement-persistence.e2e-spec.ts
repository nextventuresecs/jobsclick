import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { PlacementService } from '../src/placement/placement.service.js';
import { PersistentDatabaseStore } from '../src/database/supabase.provider.js';

describe('T-19 Persistence Across Restarts Test: Corporate Tie-Ups & Applications', () => {
  let app1: NestFastifyApplication;
  let placementService1: PlacementService;
  let createdTieUpId: string;
  let candidateApplicationId: string;
  const testInstitutionId = `inst_reboot_${Date.now()}`;

  beforeAll(async () => {
    // Phase 1: Boot API Instance 1
    const module1: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app1 = module1.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app1.init();
    await app1.getHttpAdapter().getInstance().ready();

    placementService1 = app1.get(PlacementService);
  });

  afterAll(async () => {
    if (app1) {
      await app1.close();
    }
  });

  it('creates corporate tie-up and candidate application on API Instance 1', async () => {
    const tieUp = await placementService1.createTieUp(
      testInstitutionId,
      {
        companyName: 'Larsen & Toubro Heavy Fabrication',
        sector: 'Heavy Engineering & Defence Manufacturing',
        preferredTrades: ['Welder & Fabricator', 'CNC Machinist'],
        contactPerson: 'Col. Rajesh Nair (Retd), Head Campus Alliances',
      },
      'institution',
    );

    expect(tieUp.id).toBeDefined();
    expect(tieUp.companyName).toBe('Larsen & Toubro Heavy Fabrication');
    createdTieUpId = tieUp.id;

    const studentBatch = await placementService1.shareCandidateBatch(
      testInstitutionId,
      {
        partnerId: createdTieUpId,
        studentIds: [`stu_persistent_${Date.now()}`],
        driveSubject: 'Graduate Engineer Trainee 2026',
      },
      'institution',
    );

    expect(studentBatch).toHaveLength(1);
    candidateApplicationId = studentBatch[0]!.id;

    // FSM Transition: applied -> shortlisted -> interview (performed by admin)
    await placementService1.updateStage(
      candidateApplicationId,
      { stage: 'shortlisted' },
      { id: 'admin_sys', role: 'admin' },
    );

    const updated = await placementService1.updateStage(
      candidateApplicationId,
      {
        stage: 'interview',
        interviewDate: '2026-11-15 10:00 AM',
      },
      { id: 'admin_sys', role: 'admin' },
    );

    expect(updated.stage).toBe('interview');
    expect(updated.interviewDate).toBe('2026-11-15 10:00 AM');
  });

  it('proves corporate tie-ups and applications survive pod reboot/restart on API Instance 2', async () => {
    // Simulate Pod Restart: Destroy Instance 1 completely
    await app1.close();

    // Verify PersistentDatabaseStore singleton state survives
    const rawStore = PersistentDatabaseStore.getInstance();
    expect(rawStore).toBeDefined();

    // Boot fresh API Instance 2 (Simulating new container pod)
    const module2: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app2 = module2.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app2.init();
    await app2.getHttpAdapter().getInstance().ready();

    const placementService2 = app2.get(PlacementService);

    try {
      // Query tie-ups on fresh container pod
      const tieUps = await placementService2.getTieUps(testInstitutionId, 'institution');
      const recoveredTieUp = tieUps.find((t) => t.id === createdTieUpId);

      expect(recoveredTieUp).toBeDefined();
      expect(recoveredTieUp?.companyName).toBe('Larsen & Toubro Heavy Fabrication');
      expect(recoveredTieUp?.sector).toBe('Heavy Engineering & Defence Manufacturing');

      // Query placement pipeline on fresh container pod
      const pipeline = await placementService2.getPipeline(testInstitutionId, 'institution');
      const recoveredApp = pipeline.find((a) => a.id === candidateApplicationId);

      expect(recoveredApp).toBeDefined();
      expect(recoveredApp?.stage).toBe('interview');
      expect(recoveredApp?.interviewDate).toBe('2026-11-15 10:00 AM');
      expect(recoveredApp?.companyName).toBe('Larsen & Toubro Heavy Fabrication');
    } finally {
      await app2.close();
    }
  });
});
