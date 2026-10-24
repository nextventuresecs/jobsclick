import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../database/supabase.provider.js';
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

@Injectable()
export class PlacementService {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {
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

  private getAllTieUps(): CorporateTieUp[] {
    const table = this.persistentStore.getTable<CorporateTieUp>('corporate_tie_ups');
    return Object.values(table);
  }

  private getAllApplications(): PlacementApplication[] {
    const table = this.persistentStore.getTable<PlacementApplication>('placement_applications');
    return Object.values(table);
  }

  /**
   * Scoped tie-ups retrieval with strict multi-tenant boundary checks
   */
  async getTieUps(userId: string, role: string): Promise<CorporateTieUp[]> {
    const all = this.getAllTieUps();
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

    this.persistentStore.setRow('corporate_tie_ups', newTieUp.id, newTieUp);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('corporate_tie_ups').insert({
          id: newTieUp.id,
          institution_id: newTieUp.institutionId,
          company_name: newTieUp.companyName,
          sector: newTieUp.sector,
          partnership_status: newTieUp.partnershipStatus,
          preferred_trades: newTieUp.preferredTrades,
          active_campus_drives: newTieUp.activeCampusDrives,
          total_offers_issued: newTieUp.totalOffersIssued,
          contact_person: newTieUp.contactPerson,
          partnered_since: newTieUp.partneredSince,
        });
      } catch {
        // Fallback to resilient local persistent store
      }
    }

    return newTieUp;
  }

  /**
   * Scoped pipeline retrieval with tenant isolation
   */
  async getPipeline(userId: string, role: string): Promise<PlacementApplication[]> {
    const all = this.getAllApplications();
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
    const partner = this.persistentStore.getTable<CorporateTieUp>('corporate_tie_ups')[input.partnerId];
    if (!partner) {
      throw new NotFoundException(`Corporate partner with ID ${input.partnerId} not found`);
    }

    // Tenant Isolation check: caller must own this tie-up unless admin
    if (role !== 'admin' && partner.institutionId !== institutionId) {
      throw new ForbiddenException('You do not own this corporate partnership');
    }

    // Double-check duplicates: ensure students are not already submitted to this drive
    const campusJobId = `campus-job-${partner.id}`;
    const allApps = this.getAllApplications();
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
      this.persistentStore.setRow('placement_applications', app.id, app);
    }

    if (!this.isTestMode) {
      try {
        for (const app of newBatch) {
          await this.supabase.from('placement_applications').insert({
            id: app.id,
            tie_up_id: partner.id,
            institution_id: app.institutionId,
            student_id: app.studentId,
            job_title: app.jobTitle,
            stage: app.stage,
          });
        }
      } catch {
        // Fallback to resilient local persistent store
      }
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
      const current = this.persistentStore.getTable<PlacementApplication>('placement_applications')[applicationId];
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

      this.persistentStore.setRow('placement_applications', applicationId, updated);

      // 4. Double-Placement Lock:
      // If student accepted an offer and reached 'placed', automatically lock/withdraw other active applications
      if (input.stage === 'placed') {
        const allApplications = this.getAllApplications();
        const { updatedApplications } = applyDoublePlacementLock(
          current.studentId,
          current.id,
          allApplications,
        );
        for (const lockedApp of updatedApplications) {
          this.persistentStore.setRow('placement_applications', lockedApp.id, lockedApp);
        }
      }

      if (!this.isTestMode) {
        try {
          await this.supabase.from('placement_applications').update({
            stage: updated.stage,
            offer_package: updated.offerPackage ?? null,
            interview_date: updated.interviewDate ?? null,
            updated_at: new Date().toISOString(),
          }).eq('id', applicationId);
        } catch {
          // Fallback to persistent store
        }
      }

      return updated;
    });
  }
}
