import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  BadRequestException,
  ConflictException,
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

@Injectable()
export class PlacementService {
  // In-memory persistent store for placement tie-ups and applications
  private tieUps: CorporateTieUp[] = [
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

  private applications: PlacementApplication[] = [
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

  /**
   * Scoped tie-ups retrieval with strict multi-tenant boundary checks
   */
  async getTieUps(userId: string, role: string): Promise<CorporateTieUp[]> {
    if (role === 'admin' || role === 'msme_admin') {
      return this.tieUps;
    }
    if (role === 'institution' || role === 'intermediary') {
      return this.tieUps.filter((t) => t.institutionId === userId);
    }
    if (role === 'employer') {
      return this.tieUps.filter((t) => t.employerId === userId);
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
    this.tieUps.unshift(newTieUp);
    return newTieUp;
  }

  /**
   * Scoped pipeline retrieval with tenant isolation
   */
  async getPipeline(userId: string, role: string): Promise<PlacementApplication[]> {
    if (role === 'admin' || role === 'msme_admin') {
      return this.applications;
    }
    if (role === 'institution' || role === 'intermediary') {
      return this.applications.filter((a) => a.institutionId === userId);
    }
    if (role === 'employer') {
      return this.applications.filter((a) => a.employerId === userId);
    }
    if (role === 'job_seeker') {
      return this.applications.filter((a) => a.studentId === userId);
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
    const partner = this.tieUps.find((t) => t.id === input.partnerId);
    if (!partner) {
      throw new NotFoundException(`Corporate partner with ID ${input.partnerId} not found`);
    }

    // Tenant Isolation check: caller must own this tie-up unless admin
    if (role !== 'admin' && partner.institutionId !== institutionId) {
      throw new ForbiddenException('You do not own this corporate partnership');
    }

    // Double-check duplicates: ensure students are not already submitted to this drive
    const campusJobId = `campus-job-${partner.id}`;
    const duplicateStudent = input.studentIds.find((stuId) =>
      this.applications.some(
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

    this.applications.unshift(...newBatch);
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
    const appIndex = this.applications.findIndex((a) => a.id === applicationId);
    if (appIndex === -1) {
      throw new NotFoundException(`Placement application with ID ${applicationId} not found`);
    }

    const current = this.applications[appIndex];
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

    this.applications[appIndex] = updated;

    // 4. Double-Placement Lock:
    // If student accepted an offer and reached 'placed', automatically lock/withdraw other active applications
    if (input.stage === 'placed') {
      const { updatedApplications } = applyDoublePlacementLock(
        current.studentId,
        current.id,
        this.applications,
      );
      this.applications = [...updatedApplications];
    }

    return updated;
  }
}
