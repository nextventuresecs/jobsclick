import { sponsorshipActivationResultSchema, type SponsorshipActivationResult } from '@indian-job-portal/validation';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  SPONSORSHIP_TIERS,
  type SponsorshipTier,
  type SponsorshipQuote,
  type ActivateSponsorshipInput,
} from '@indian-job-portal/validation';
import type {
  InstitutionProfileRow,
  InstitutionSponsorshipRow,
} from '@indian-job-portal/database';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import { AuditLogRepository } from '../database/repositories/audit-log.repository.js';
import { PaymentRepository } from '../database/repositories/payment.repository.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class SponsorshipService {
  constructor(
    @Inject(ProfileRepository)
    private readonly profileRepository: ProfileRepository,
    @Inject(AuditLogRepository)
    private readonly auditLogRepository: AuditLogRepository,
    @Inject(PaymentRepository)
    private readonly paymentRepository: PaymentRepository,
  ) {}

  /**
   * Automatically select pricing band based on student count (WAL-05 & Section 10.1)
   * Small (up to 2,000 students): ₹150/student/year
   * Medium (2,001–10,000 students): ₹100/student/year
   * Large (10,001+ students): ₹70/student/year
   */
  calculateTier(studentCount: number): {
    tier: SponsorshipTier;
    ratePerStudentInr: number;
    tierName: string;
    tierNameHi: string;
  } {
    if (studentCount < 0) {
      throw new BadRequestException('Student count cannot be negative');
    }

    if (studentCount <= SPONSORSHIP_TIERS.Small.maxStudents) {
      return {
        tier: 'Small',
        ratePerStudentInr: SPONSORSHIP_TIERS.Small.ratePerStudentInr,
        tierName: SPONSORSHIP_TIERS.Small.name,
        tierNameHi: SPONSORSHIP_TIERS.Small.nameHi,
      };
    } else if (studentCount <= SPONSORSHIP_TIERS.Medium.maxStudents) {
      return {
        tier: 'Medium',
        ratePerStudentInr: SPONSORSHIP_TIERS.Medium.ratePerStudentInr,
        tierName: SPONSORSHIP_TIERS.Medium.name,
        tierNameHi: SPONSORSHIP_TIERS.Medium.nameHi,
      };
    } else {
      return {
        tier: 'Large',
        ratePerStudentInr: SPONSORSHIP_TIERS.Large.ratePerStudentInr,
        tierName: SPONSORSHIP_TIERS.Large.name,
        tierNameHi: SPONSORSHIP_TIERS.Large.nameHi,
      };
    }
  }

  /**
   * Get sponsorship quote for an institution
   * GET /institutions/:id/sponsorship-quote
   */
  async getSponsorshipQuote(
    institutionId: string,
    studentCountOverride?: number,
  ): Promise<SponsorshipQuote> {
    let institution = await this.profileRepository.findInstitutionProfileById(institutionId);
    if (!institution) {
      institution = await this.profileRepository.findInstitutionProfileByUserId(institutionId);
    }

    const institutionName = institution?.institution_name || 'Educational Institution';

    // Count enrolled students in database linked to this institution
    const enrolledStudents = await this.profileRepository.findStudentsByInstitution(
      institution?.id || institutionId,
    );

    let count = Math.max(studentCountOverride ?? 0, enrolledStudents.length);

    // Default to at least 1 student for quoting purposes if none enrolled yet
    if (count <= 0) {
      count = 1;
    }

    const tierInfo = this.calculateTier(count);
    const baseAnnualFeeInr = count * tierInfo.ratePerStudentInr;
    const gstRate = 0.18; // 18% GST (SAC: 998311 - Education Support Services)
    const gstAmountInr = Math.round(baseAnnualFeeInr * gstRate);
    const totalAnnualFeeInr = baseAnnualFeeInr + gstAmountInr;

    return {
      institutionId: institution?.id || institutionId,
      institutionName,
      studentCount: count,
      tier: tierInfo.tier,
      ratePerStudentInr: tierInfo.ratePerStudentInr,
      baseAnnualFeeInr,
      gstRate,
      gstAmountInr,
      totalAnnualFeeInr,
      isSponsorshipActive: institution?.is_sponsorship_active ?? false,
      sponsorshipExpiresAt: institution?.sponsorship_expires_at ?? null,
      activeSponsoredCount: institution?.total_sponsored_students ?? (institution?.is_sponsorship_active ? enrolledStudents.length : 0),
    };
  }

  /**
   * Activate annual sponsorship for an institution (WAL-05)
   * All enrolled students receive unlimited applications without consuming wallet balance.
   * Includes:
   * 1. Authoritative secondary ownership check (service-level gate)
   * 2. Payment verification & mapping
   * 3. Idempotency key evaluation
   * 4. Native database transaction; disposable JSON adapter only in tests
   * 5. Append-only audit logging
   */
  async activateSponsorship(
    institutionId: string,
    input?: ActivateSponsorshipInput,
    userOrActorId?: AuthUser | { id: string; role?: string; phone?: string; email?: string | null } | string,
  ): Promise<SponsorshipActivationResult> {
    const user =
      typeof userOrActorId === 'object' && userOrActorId !== null
        ? userOrActorId
        : {
            id: typeof userOrActorId === 'string' ? userOrActorId : institutionId,
            role: 'intermediary',
          };

    return this.profileRepository.activateSponsorshipAtomically({ institutionId, actorId: user.id, ...input }, async () => {
    // Test-adapter implementation; native RPC rechecks every rule under database locks.
    // 1. Authoritative ownership re-check inside service
    let instProfile: InstitutionProfileRow | null =
      await this.profileRepository.findInstitutionProfileById(institutionId);
    if (!instProfile) {
      instProfile = await this.profileRepository.findInstitutionProfileByUserId(institutionId);
    }

    if (instProfile) {
      const isOwner = instProfile.user_id === user.id;
      const isIntermediaryAdmin =
        (user.role === 'intermediary' || user.role === 'institution') &&
        (instProfile.created_by === user.id || instProfile.user_id === user.id);
      const isPlatformAdmin = user.role === 'admin' || user.role === 'msme_admin';

      if (!(isOwner || isIntermediaryAdmin || isPlatformAdmin)) {
        throw new ForbiddenException(
          'You are not authorized to activate sponsorship for this institution',
        );
      }
    } else {
      const isSelfUser = user.id === institutionId;
      const isIntermediary = user.role === 'intermediary' || user.role === 'institution';
      const isPlatformAdmin = user.role === 'admin' || user.role === 'msme_admin';

      if (!(isSelfUser || isIntermediary || isPlatformAdmin)) {
        throw new ForbiddenException(
          'You are not authorized to activate sponsorship for this institution',
        );
      }
    }

    // 2. Payment verification (required for every paid activation)

    if (!input?.paymentReference) {
      throw new BadRequestException('A verified, captured payment reference is required to activate sponsorship');
    }

    let paymentId: string | undefined;
    if (input?.paymentReference) {
      const payment =
        (await this.paymentRepository.findByGatewayPaymentId(input.paymentReference)) ||
        (await this.paymentRepository.findById(input.paymentReference)) ||
        (await this.paymentRepository.findByGatewayOrderId(input.paymentReference));

      if (!payment) {
        throw new BadRequestException(`Payment reference ${input.paymentReference} not found`);
      }

      paymentId = payment.id;
      if (payment.status !== 'captured') {
        throw new BadRequestException('Payment not verified: payment status is not captured');
      }

      // Quote at least the UUID-associated enrolled count; an override cannot lower the paid minimum.
      const requiredQuote = await this.getSponsorshipQuote(instProfile?.id || institutionId, input.studentCountOverride);
      if (payment.currency !== 'INR' || !Number.isFinite(payment.amount_inr)
        || payment.amount_inr < requiredQuote.totalAnnualFeeInr) {
        throw new BadRequestException('SPONSORSHIP_PAYMENT_INSUFFICIENT');
      }

      const isPaymentOwner =
        payment.user_id === user.id ||
        (instProfile && payment.user_id === instProfile.user_id);
      if (!isPaymentOwner) {
        throw new ForbiddenException('Payment is not linked to this institution or caller');
      }
      if (payment.metadata?.['purpose'] !== 'sponsorship' || payment.metadata?.['institutionId'] !== instProfile?.id
        || (payment.credits_added ?? 0) !== 0 || payment.pack_id) throw new BadRequestException('SPONSORSHIP_PAYMENT_PURPOSE_INVALID');
      const receipt = this.profileRepository.findTestPaymentGrant(payment.id);
      const key = input.idempotencyKey ?? 'payment:' + payment.id;
      const fingerprint = { studentCountOverride: input.studentCountOverride ?? null, force: input.force ?? false };
      if (receipt) {
        if (receipt.target_id !== instProfile?.id || receipt.request_key !== key || JSON.stringify(receipt.fingerprint) !== JSON.stringify(fingerprint)) {
          throw new BadRequestException('SPONSORSHIP_PAYMENT_ALREADY_USED');
        }
        return { ...sponsorshipActivationResultSchema.parse(receipt.result), alreadyActive: true };
      }

    }

    if (input?.idempotencyKey && await this.profileRepository.findSponsorshipByIdempotencyKey(input.idempotencyKey)) {
      throw new BadRequestException('SPONSORSHIP_IDEMPOTENCY_CONFLICT');
    }

    // 4. Process-local lock; this is NOT a database transaction or cross-instance lock
    return this.profileRepository.withLock(institutionId, async () => {
      // Re-read institution state within the transaction lock
      let lockedInst: InstitutionProfileRow | null =
        await this.profileRepository.findInstitutionProfileById(institutionId);
      if (!lockedInst) {
        lockedInst = await this.profileRepository.findInstitutionProfileByUserId(institutionId);
      }

      // Idempotency: if already active and not expired, return existing record
      if (
        lockedInst &&
        lockedInst.is_sponsorship_active &&
        lockedInst.sponsorship_expires_at &&
        new Date(lockedInst.sponsorship_expires_at).getTime() > Date.now() &&
        !input?.force
      ) {
        throw new BadRequestException('SPONSORSHIP_ALREADY_ACTIVE');
      }

      if (!lockedInst) throw new BadRequestException('SPONSORSHIP_INSTITUTION_NOT_FOUND');

      const institution = lockedInst;
      const quote = await this.getSponsorshipQuote(institution.id, input?.studentCountOverride);

      // Mark all enrolled students as sponsored
      const countById = await this.profileRepository.updateStudentSponsorshipByInstitution(
        institution.id,
        true,
      );
      const totalSponsoredStudents = countById;

      // 1-year annual duration
      const now = new Date();
      const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const sponsorshipId = randomUUID();

      // Insert institution sponsorship row (WAL-05 DB Defense-in-depth)
      const sponsorshipRecord: InstitutionSponsorshipRow = {
        id: sponsorshipId,
        institution_id: institution.id,
        tier: quote.tier,
        rate_per_student: quote.ratePerStudentInr,
        annual_fee: quote.totalAnnualFeeInr,
        student_count: totalSponsoredStudents,
        status: 'active',
        payment_reference: paymentId || null,
        idempotency_key: input?.idempotencyKey || null,
        started_at: now.toISOString(),
        expires_at: oneYearLater,
        created_by: user.id || null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
      await this.profileRepository.saveSponsorship(sponsorshipRecord);

      // Update institution profile row
      institution.is_sponsorship_active = true;
      institution.sponsorship_tier = quote.tier;
      institution.sponsorship_rate_per_student = quote.ratePerStudentInr;
      institution.sponsorship_expires_at = oneYearLater;
      institution.total_sponsored_students = totalSponsoredStudents;
      institution.annual_sponsorship_fee = quote.totalAnnualFeeInr;
      institution.updated_at = now.toISOString();

      await this.profileRepository.saveInstitutionProfile(institution);

      // Append to immutable audit log (Hard Invariant #6)
      await this.auditLogRepository.append({
          id: randomUUID(),
          actor_id: user.id || institution.user_id,
          action: 'INSTITUTION_SPONSORSHIP_ACTIVATED',
          meta: {
            institutionId: institution.id,
            sponsorshipId: sponsorshipRecord.id,
            institutionName: institution.institution_name,
            tier: quote.tier,
            studentCount: totalSponsoredStudents,
            ratePerStudent: quote.ratePerStudentInr,
            totalAnnualFeeInr: quote.totalAnnualFeeInr,
            paymentReference: input?.paymentReference || 'DIRECT_PORTAL_ACTIVATION',
            idempotencyKey: input?.idempotencyKey || null,
            expiresAt: oneYearLater,
          },
          created_at: now.toISOString(),
        });

      const updatedQuote: SponsorshipQuote = {
        ...quote,
        isSponsorshipActive: true,
        sponsorshipExpiresAt: oneYearLater,
        activeSponsoredCount: totalSponsoredStudents,
      };

      const result = { success: true as const, quote: updatedQuote, sponsoredStudentsCount: totalSponsoredStudents,
        expiresAt: oneYearLater, sponsorshipId: sponsorshipRecord.id, alreadyActive: false };
      if (!paymentId) throw new BadRequestException('SPONSORSHIP_PAYMENT_INVALID');
      this.profileRepository.saveTestPaymentGrant({ payment_id: paymentId, purpose: 'sponsorship', target_id: institution.id,
        request_key: input?.idempotencyKey ?? 'payment:' + paymentId,
        fingerprint: { studentCountOverride: input?.studentCountOverride ?? null, force: input?.force ?? false },
        result, created_at: now.toISOString() });
      return result;
    });
    });
  }
}
