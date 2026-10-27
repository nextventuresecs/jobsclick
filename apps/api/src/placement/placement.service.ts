import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import {
  type CorporateTieUp,
  type CreateCorporateTieUpInput,
  type PlacementApplication,
  type ShareCandidateBatchInput,
  type UpdatePlacementStageInput,
  type PlacementActorRole,
  assertValidTransition,
  applyDoublePlacementLock,
  IllegalStateTransitionError,
  MissingTransitionPayloadError,
  UnauthorizedStateTransitionActorError,
} from '@indian-job-portal/validation';
import type { CorporateTieUpRow, PlacementApplicationRow } from '@indian-job-portal/database';
import { CorporateTieUpRepository } from '../database/repositories/corporate-tie-up.repository.js';
import { PlacementPipelineRepository } from '../database/repositories/placement-pipeline.repository.js';
import { PersistentDatabaseStore } from '../database/supabase.provider.js';

const SEED_TIE_UPS: CorporateTieUp[] = [
  {
    id: 'tieup-01',
    institutionId: 'inst-01',
    employerId: 'emp-01',
    companyName: 'Aarya Precision Engineering Pvt Ltd',
    sector: 'Automotive & Precision Machining',
    partnershipStatus: 'active',
    preferredTrades: ['CNC Machinist', 'Fitter & Turner'],
    activeCampusDrives: 2,
    totalOffersIssued: 14,
    partneredSince: '2025-06-15',
    contactPerson: 'Sunil Verma (Campus Talent Lead)',
  },
  {
    id: 'tieup-02',
    institutionId: 'inst-01',
    employerId: 'emp-02',
    companyName: 'Shakti Electricals & Switchgear Works',
    sector: 'Electrical Equipment & Panel Fabrication',
    partnershipStatus: 'mou_signed',
    preferredTrades: ['Electrician & Wireman', 'Electronics & Instrumentation'],
    activeCampusDrives: 1,
    totalOffersIssued: 9,
    partneredSince: '2025-11-20',
    contactPerson: 'Meera Deshmukh (DGM Human Resources)',
  },
  {
    id: 'tieup-03',
    institutionId: 'inst-01',
    employerId: 'emp-03',
    companyName: 'Apex Industrial Automation Solutions',
    sector: 'Robotics, PLC & Smart Factory Systems',
    partnershipStatus: 'active',
    preferredTrades: ['Electrician & Wireman', 'Computer Operator & Programming (COPA)'],
    activeCampusDrives: 2,
    totalOffersIssued: 8,
    partneredSince: '2026-01-10',
    contactPerson: 'Anand Kulkarni (Technical Recruiter)',
  },
];

const SEED_APPLICATIONS: PlacementApplication[] = [
  {
    id: 'app-pl-01',
    institutionId: 'inst-01',
    employerId: 'emp-01',
    studentId: 'stu-01',
    studentName: 'Amitesh Chouhan',
    rollNumber: '0801ME221045',
    trade: 'CNC Machinist',
    passingYear: '2026',
    grade: 'Distinction (85%+)',
    jobId: 'job-01',
    jobTitle: 'CNC Machine Operator & Programmer',
    companyName: 'Aarya Precision Engineering Pvt Ltd',
    isPartneredEmployer: true,
    stage: 'interview',
    interviewDate: '2026-10-24 at 11:00 AM',
    updatedAt: '2026-10-18',
  },
  {
    id: 'app-pl-02',
    institutionId: 'inst-01',
    employerId: 'emp-02',
    studentId: 'stu-02',
    studentName: 'Pooja Vishwakarma',
    rollNumber: '0801EC221089',
    trade: 'Electrician & Wireman',
    passingYear: '2026',
    grade: 'Grade A+',
    jobId: 'job-02',
    jobTitle: 'Substation & Wiring Maintenance Technician',
    companyName: 'Shakti Electricals & Switchgear Works',
    isPartneredEmployer: true,
    stage: 'placed',
    offerPackage: '₹3.2 LPA + Overtime Allowance',
    offerLetterUrl: 'https://example.com/offers/pooja-vishwakarma-offer.pdf',
    updatedAt: '2026-10-15',
  },
  {
    id: 'app-pl-03',
    institutionId: 'inst-01',
    employerId: 'emp-03',
    studentId: 'stu-04',
    studentName: 'Suman Patidar',
    rollNumber: '0801EE221067',
    trade: 'Electrician & Wireman',
    passingYear: '2025',
    grade: 'Distinction (85%+)',
    jobId: 'job-03',
    jobTitle: 'Industrial Automation Technician',
    companyName: 'Apex Industrial Automation Solutions',
    isPartneredEmployer: true,
    stage: 'offered',
    offerPackage: '₹2.8 LPA + Shift Allowance',
    offerLetterUrl: 'https://example.com/offers/suman-patidar-offer.pdf',
    updatedAt: '2026-10-17',
  },
];

function mapTieUpRowToDomain(row: CorporateTieUpRow | (CorporateTieUp & { institution_id?: string; employer_id?: string; company_name?: string; partnership_status?: string; preferred_trades?: string[]; active_campus_drives?: number; total_offers_issued?: number; partnered_since?: string; contact_person?: string })): CorporateTieUp {
  return {
    id: row.id,
    institutionId: ('institution_id' in row && row.institution_id) ? row.institution_id : ('institutionId' in row ? row.institutionId : ''),
    employerId: ('employer_id' in row && row.employer_id) ? row.employer_id : ('employerId' in row ? row.employerId : ''),
    companyName: ('company_name' in row && row.company_name) ? row.company_name : ('companyName' in row ? row.companyName : ''),
    sector: row.sector,
    partnershipStatus: (('partnership_status' in row && row.partnership_status) ? row.partnership_status : ('partnershipStatus' in row ? row.partnershipStatus : 'mou_signed')) as CorporateTieUp['partnershipStatus'],
    preferredTrades: ('preferred_trades' in row && row.preferred_trades) ? row.preferred_trades : ('preferredTrades' in row ? row.preferredTrades : []),
    activeCampusDrives: ('active_campus_drives' in row && typeof row.active_campus_drives === 'number') ? row.active_campus_drives : ('activeCampusDrives' in row ? row.activeCampusDrives : 0),
    totalOffersIssued: ('total_offers_issued' in row && typeof row.total_offers_issued === 'number') ? row.total_offers_issued : ('totalOffersIssued' in row ? row.totalOffersIssued : 0),
    partneredSince: ('partnered_since' in row && row.partnered_since) ? row.partnered_since : ('partneredSince' in row ? row.partneredSince : '2026-10-23'),
    contactPerson: ('contact_person' in row && row.contact_person) ? row.contact_person : ('contactPerson' in row ? row.contactPerson : ''),
  };
}

function mapDomainToTieUpRow(domain: CorporateTieUp): CorporateTieUpRow {
  const now = new Date().toISOString();
  return {
    id: domain.id,
    institution_id: domain.institutionId,
    employer_id: domain.employerId || null,
    company_name: domain.companyName,
    sector: domain.sector,
    partnership_status: domain.partnershipStatus,
    preferred_trades: domain.preferredTrades,
    active_campus_drives: domain.activeCampusDrives,
    total_offers_issued: domain.totalOffersIssued,
    contact_person: domain.contactPerson,
    partnered_since: domain.partneredSince,
    created_by: null,
    created_at: now,
    updated_at: now,
  };
}

function mapAppRowToDomain(row: PlacementApplicationRow | (PlacementApplication & { institution_id?: string; student_id?: string; job_id?: string; job_title?: string; offer_package?: string | null; offer_letter_url?: string | null; interview_date?: string | null; updated_at?: string })): PlacementApplication {
  const instId = ('institution_id' in row && row.institution_id) ? row.institution_id : ('institutionId' in row ? row.institutionId : '');
  const stuId = ('student_id' in row && row.student_id) ? row.student_id : ('studentId' in row ? row.studentId : '');
  const jId = ('job_id' in row && row.job_id) ? row.job_id : ('jobId' in row ? row.jobId : '');
  const jTitle = ('job_title' in row && row.job_title) ? row.job_title : ('jobTitle' in row ? row.jobTitle : '');
  const sStage = ('stage' in row && row.stage) ? row.stage : 'applied';
  const op = ('offer_package' in row && row.offer_package) ? row.offer_package : ('offerPackage' in row ? row.offerPackage : undefined);
  const ol = ('offer_letter_url' in row && row.offer_letter_url) ? row.offer_letter_url : ('offerLetterUrl' in row ? row.offerLetterUrl : undefined);
  const idt = ('interview_date' in row && row.interview_date) ? row.interview_date : ('interviewDate' in row ? row.interviewDate : undefined);
  const uAt = ('updated_at' in row && row.updated_at) ? row.updated_at : ('updatedAt' in row ? row.updatedAt : '2026-10-23');

  return {
    id: row.id,
    institutionId: instId,
    employerId: ('employerId' in row && row.employerId) ? row.employerId : '',
    studentId: stuId,
    studentName: ('studentName' in row && row.studentName) ? row.studentName : `Candidate ${stuId}`,
    rollNumber: ('rollNumber' in row && row.rollNumber) ? row.rollNumber : `ROLL-${stuId}`,
    trade: ('trade' in row && row.trade) ? row.trade : 'General Technical',
    passingYear: ('passingYear' in row && row.passingYear) ? row.passingYear : '2026',
    grade: ('grade' in row && row.grade) ? row.grade : 'First Class',
    jobId: jId,
    jobTitle: jTitle,
    companyName: ('companyName' in row && row.companyName) ? row.companyName : '',
    isPartneredEmployer: true,
    stage: sStage as PlacementApplication['stage'],
    offerPackage: op ?? undefined,
    offerLetterUrl: ol ?? undefined,
    interviewDate: idt ?? undefined,
    updatedAt: uAt.split('T')[0] ?? uAt,
  };
}

function mapDomainToAppRow(domain: PlacementApplication, tieUpId: string): PlacementApplicationRow {
  const now = new Date().toISOString();
  return {
    id: domain.id,
    tie_up_id: tieUpId,
    institution_id: domain.institutionId || '',
    student_id: domain.studentId,
    job_id: domain.jobId,
    job_title: domain.jobTitle,
    stage: domain.stage,
    offer_package: domain.offerPackage || null,
    offer_letter_url: domain.offerLetterUrl || null,
    interview_date: domain.interviewDate || null,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
  };
}

@Injectable()
export class PlacementService {
  private persistentStore = PersistentDatabaseStore.getInstance();

  constructor(
    @Inject(CorporateTieUpRepository) private readonly tieUpRepo: CorporateTieUpRepository,
    @Inject(PlacementPipelineRepository) private readonly pipelineRepo: PlacementPipelineRepository,
  ) {
    this.seedInitialDataIfEmpty();
  }

  public resetSeedData(): void {
    this.persistentStore.clearTable('corporate_tie_ups');
    this.persistentStore.clearTable('placement_applications');
    for (const t of SEED_TIE_UPS) {
      this.persistentStore.setRow('corporate_tie_ups', t.id, t);
    }
    for (const a of SEED_APPLICATIONS) {
      this.persistentStore.setRow('placement_applications', a.id, a);
    }
  }

  private seedInitialDataIfEmpty(): void {
    // File-based seeding is disabled in production; Supabase is the sole source of truth.
    if (process.env['NODE_ENV'] === 'production') {
      return;
    }

    const tieUpsTable = this.persistentStore.getTable<CorporateTieUp>('corporate_tie_ups');
    if (Object.keys(tieUpsTable).length === 0) {
      for (const t of SEED_TIE_UPS) {
        this.persistentStore.setRow('corporate_tie_ups', t.id, t);
      }
    }

    const appsTable = this.persistentStore.getTable<PlacementApplication>('placement_applications');
    if (Object.keys(appsTable).length === 0) {
      for (const a of SEED_APPLICATIONS) {
        this.persistentStore.setRow('placement_applications', a.id, a);
      }
    }
  }

  private async getAllTieUps(): Promise<CorporateTieUp[]> {
    // 1. First retrieve all from repository
    const rows = await this.tieUpRepo.findAll();
    // 2. Also check local persistent store for pre-seeded items
    const storeTable = this.persistentStore.getTable<CorporateTieUp>('corporate_tie_ups');
    const storeItems = Object.values(storeTable);

    const merged = new Map<string, CorporateTieUp>();
    for (const s of storeItems) {
      merged.set(s.id, s);
    }
    for (const r of rows) {
      const dom = mapTieUpRowToDomain(r);
      merged.set(dom.id, { ...(merged.get(dom.id) || {}), ...dom });
    }

    return Array.from(merged.values());
  }

  private async getAllApplications(): Promise<PlacementApplication[]> {
    const rows = await this.pipelineRepo.findAll();
    const storeTable = this.persistentStore.getTable<PlacementApplication>('placement_applications');
    const storeItems = Object.values(storeTable);

    const merged = new Map<string, PlacementApplication>();
    for (const s of storeItems) {
      merged.set(s.id, s);
    }
    for (const r of rows) {
      const dom = mapAppRowToDomain(r);
      const existing = merged.get(dom.id);
      merged.set(dom.id, {
        ...(existing || {}),
        ...dom,
        studentName: existing?.studentName || dom.studentName,
        rollNumber: existing?.rollNumber || dom.rollNumber,
        trade: existing?.trade || dom.trade,
        passingYear: existing?.passingYear || dom.passingYear,
        grade: existing?.grade || dom.grade,
        companyName: existing?.companyName || dom.companyName,
        employerId: existing?.employerId || dom.employerId,
      });
    }

    return Array.from(merged.values());
  }

  /**
   * Scoped tie-ups retrieval with strict multi-tenant boundary checks
   */
  async getTieUps(userId: string, role: string): Promise<CorporateTieUp[]> {
    const all = await this.getAllTieUps();
    if (role === 'admin' || role === 'msme_admin') {
      return all;
    }
    if (role === 'institution' || role === 'intermediary') {
      return all.filter((t) => t.institutionId === userId);
    }
    if (role === 'employer') {
      return all.filter((t) => t.employerId === userId);
    }
    return [];
  }

  /**
   * Empanel a corporate MSME partner for an institution
   */
  async createTieUp(
    institutionId: string,
    input: CreateCorporateTieUpInput,
    role: string,
  ): Promise<CorporateTieUp> {
    if (role !== 'institution' && role !== 'intermediary' && role !== 'admin') {
      throw new ForbiddenException('Only institutions and administrators can empanel corporate partners');
    }

    const newTieUp: CorporateTieUp = {
      id: `tieup-${Date.now()}`,
      institutionId,
      employerId: `emp-${Date.now()}`,
      companyName: input.companyName,
      sector: input.sector,
      partnershipStatus: 'mou_signed',
      preferredTrades: input.preferredTrades,
      activeCampusDrives: 1,
      totalOffersIssued: 0,
      partneredSince: new Date().toISOString().split('T')[0] ?? '2026-10-23',
      contactPerson: input.contactPerson,
    };

    // 1. Delegate persistence to CorporateTieUpRepository (Supabase table corporate_tie_ups)
    await this.tieUpRepo.create(mapDomainToTieUpRow(newTieUp));
    // 2. Also keep local persistent store updated for instant queries
    this.persistentStore.setRow('corporate_tie_ups', newTieUp.id, newTieUp);

    return newTieUp;
  }

  /**
   * Scoped pipeline retrieval with tenant isolation
   */
  async getPipeline(userId: string, role: string): Promise<PlacementApplication[]> {
    const all = await this.getAllApplications();
    if (role === 'admin' || role === 'msme_admin') {
      return all;
    }
    if (role === 'institution' || role === 'intermediary') {
      return all.filter((a) => a.institutionId === userId);
    }
    if (role === 'employer') {
      return all.filter((a) => a.employerId === userId);
    }
    if (role === 'job_seeker') {
      return all.filter((a) => a.studentId === userId);
    }
    return [];
  }

  /**
   * Dispatches a candidate batch to an empanelled employer.
   * Enforces zero PII exposure over wire and verifies partner ownership.
   */
  async shareCandidateBatch(
    institutionId: string,
    input: ShareCandidateBatchInput,
    role: string,
  ): Promise<PlacementApplication[]> {
    const allTieUps = await this.getAllTieUps();
    const partner = allTieUps.find((t) => t.id === input.partnerId);
    if (!partner) {
      throw new NotFoundException(`Corporate partner with ID ${input.partnerId} not found`);
    }

    // Tenant Isolation check: caller must own this tie-up unless admin
    if (role !== 'admin' && partner.institutionId !== institutionId) {
      throw new ForbiddenException('You do not own this corporate partnership');
    }

    // Double-check duplicates: ensure students are not already submitted to this drive
    const campusJobId = `campus-job-${partner.id}`;
    const allApps = await this.getAllApplications();
    const duplicateStudent = input.studentIds.find((stuId) =>
      allApps.some(
        (app) => app.studentId === stuId && app.jobId === campusJobId && app.stage !== 'rejected',
      ),
    );

    if (duplicateStudent) {
      throw new ConflictException(
        `Candidate with ID ${duplicateStudent} already has an active application for this drive`,
      );
    }

    const nowStr = new Date().toISOString().split('T')[0] ?? '2026-10-23';
    const newBatch: PlacementApplication[] = input.studentIds.map((studentId, idx) => ({
      id: `app-pl-${Date.now()}-${idx}`,
      institutionId,
      employerId: partner.employerId,
      studentId,
      studentName: `Candidate ${studentId}`,
      rollNumber: `ROLL-${studentId}`,
      trade: partner.preferredTrades[0] ?? 'General Technical',
      passingYear: '2026',
      grade: 'First Class',
      jobId: campusJobId,
      jobTitle: `${input.driveSubject} Trainee`,
      companyName: partner.companyName,
      isPartneredEmployer: true,
      stage: 'applied',
      updatedAt: nowStr,
    }));

    for (const app of newBatch) {
      // 1. Delegate persistence to PlacementPipelineRepository (Supabase table placement_applications)
      await this.pipelineRepo.create(mapDomainToAppRow(app, partner.id));
      // 2. Also keep local persistent store updated
      this.persistentStore.setRow('placement_applications', app.id, app);
    }

    return newBatch;
  }

  /**
   * State Machine Stage Mutation:
   * Validates actor authorization, state transition graph legality, and double-placement lock.
   */
  async updateStage(
    applicationId: string,
    input: UpdatePlacementStageInput,
    user: { id: string; role: string },
  ): Promise<PlacementApplication> {
    return this.persistentStore.withLock(`placement_app_${applicationId}`, async () => {
      const allApps = await this.getAllApplications();
      const current = allApps.find((a) => a.id === applicationId);
      if (!current) {
        throw new NotFoundException(`Placement application with ID ${applicationId} not found`);
      }

      // 1. Multi-Tenant Authorization check (BOLA/IDOR prevention)
      const isPlatformAdmin = user.role === 'admin' || user.role === 'msme_admin';
      const isOwnerInstitution =
        (user.role === 'institution' || user.role === 'intermediary') && current.institutionId === user.id;
      const isOwnerEmployer = user.role === 'employer' && current.employerId === user.id;
      const isOwnerCandidate = user.role === 'job_seeker' && current.studentId === user.id;

      if (!isPlatformAdmin && !isOwnerInstitution && !isOwnerEmployer && !isOwnerCandidate) {
        throw new ForbiddenException('You are not authorized to update this placement application');
      }

      // 2. Pure FSM Transition Validation
      try {
        assertValidTransition({
          currentStage: current.stage,
          targetStage: input.stage,
          actorRole: user.role as PlacementActorRole,
          offerPackage: input.offerPackage,
          existingOfferPackage: current.offerPackage,
          interviewDate: input.interviewDate,
        });
      } catch (err) {
        if (err instanceof IllegalStateTransitionError) {
          throw new UnprocessableEntityException(err.message);
        }
        if (err instanceof MissingTransitionPayloadError) {
          throw new BadRequestException(err.message);
        }
        if (err instanceof UnauthorizedStateTransitionActorError) {
          throw new ForbiddenException(err.message);
        }
        throw new BadRequestException((err as Error).message);
      }

      // 3. Apply state mutation
      const nowStr = new Date().toISOString().split('T')[0] ?? '2026-10-23';
      const updated: PlacementApplication = {
        ...current,
        stage: input.stage,
        offerPackage: input.offerPackage ?? current.offerPackage,
        interviewDate: input.interviewDate ?? current.interviewDate,
        updatedAt: nowStr,
      };

      // Delegate update to repository
      await this.pipelineRepo.update(applicationId, {
        stage: updated.stage,
        offer_package: updated.offerPackage || null,
        interview_date: updated.interviewDate || null,
      });
      this.persistentStore.setRow('placement_applications', applicationId, updated);

      // 4. Double-Placement Lock:
      // If student accepted an offer and reached 'placed', automatically lock/withdraw other active applications
      if (input.stage === 'placed') {
        const freshApps = await this.getAllApplications();
        const { updatedApplications } = applyDoublePlacementLock(
          current.studentId,
          current.id,
          freshApps,
        );
        for (const lockedApp of updatedApplications) {
          await this.pipelineRepo.update(lockedApp.id, {
            stage: lockedApp.stage,
          });
          this.persistentStore.setRow('placement_applications', lockedApp.id, lockedApp);
        }
      }

      return updated;
    });
  }
}
