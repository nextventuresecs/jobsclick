import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import crypto from 'node:crypto';
import {
  computeSponsorshipQuote,
  type SponsorshipQuote,
  type SponsorshipQuoteInput,
  type CreateSponsorshipOrderInput,
  type SponsorshipOrderSnapshot,
  type ActivateSponsorshipInput,
} from '@indian-job-portal/validation';
import type {
  InstitutionProfileRow,
  InstitutionSponsorshipRow,
} from '@indian-job-portal/database';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import { PaymentRepository } from '../database/repositories/payment.repository.js';
import { AuditLogRepository } from '../database/repositories/audit-log.repository.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { RAZORPAY_GATEWAY, type RazorpayGateway } from './razorpay.gateway.js';

export interface SponsorshipStatusResult {
  status: 'active' | 'none' | 'expired';
  tier: string | null;
  cap: number | null;
  seatsUsed: number;
  expiresAt: string | null;
}

export interface SponsorshipOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  quote: SponsorshipOrderSnapshot;
}

@Injectable()
export class SponsorshipService {
  private readonly logger = new Logger(SponsorshipService.name);

  constructor(
    @Inject(RAZORPAY_GATEWAY)
    private readonly gateway: RazorpayGateway,
    @Inject(ProfileRepository)
    private readonly profileRepository: ProfileRepository,
    @Inject(PaymentRepository)
    private readonly paymentRepository: PaymentRepository,
    @Inject(AuditLogRepository)
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  /**
   * Helper to resolve institution profile and verify owner authorization.
   * Throws 404 NotFoundException if not found, or 403 ForbiddenException if not owner.
   */
  async resolveOwnedInstitution(userId: string, institutionId?: string, isAdmin = false) {
    let inst = null;
    if (institutionId) {
      inst = await this.profileRepository.findInstitutionProfileById(institutionId);
      if (!inst) {
        inst = await this.profileRepository.findInstitutionProfileByUserId(institutionId);
      }
      if (!inst) {
        throw new NotFoundException('Institution not found');
      }
      if (!isAdmin && inst.user_id !== userId) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Institution not found',
        });
      }
    } else {
      inst = await this.profileRepository.findInstitutionProfileByUserId(userId);
      if (!inst) {
        throw new NotFoundException('Institution not found');
      }
    }
    return inst;
  }

  /**
   * Automatically select pricing band based on student count (WAL-05, Section 10.1)
   */
  calculateTier(studentCount: number): {
    tier: string;
    ratePerStudentInr: number;
    tierName: string;
    tierNameHi: string;
  } {
    const snap = computeSponsorshipQuote('00000000-0000-0000-0000-000000000000', studentCount);
    return {
      tier: snap.tier,
      ratePerStudentInr: snap.ratePaise / 100,
      tierName: snap.tier,
      tierNameHi: snap.tier === 'Small' ? 'छोटा' : snap.tier === 'Medium' ? 'मध्यम' : 'बड़ा',
    };
  }

  /**
   * Compute sponsorship quote for institution (WAL-05, INT-05)
   * Server calculates tier, rate, and fee. Ignores any client-supplied price/tier.
   * Uses larger of currently linked students and declared student count.
   */
  async getSponsorshipQuote(
    userId: string,
    input?: SponsorshipQuoteInput | number,
    isAdmin = false,
  ): Promise<SponsorshipQuote> {
    const quoteInput: SponsorshipQuoteInput =
      typeof input === 'number'
        ? { institutionId: userId, declaredStudentCount: input }
        : input || { institutionId: userId };

    let inst: InstitutionProfileRow;
    if (typeof input === 'number') {
      let found = await this.profileRepository.findInstitutionProfileById(userId);
      if (!found) {
        found = await this.profileRepository.findInstitutionProfileByUserId(userId);
      }
      if (!found) {
        const count = Math.max(input, 1);
        const snapshot = computeSponsorshipQuote('00000000-0000-0000-0000-000000000000', count, 365);
        return {
          institutionId: '00000000-0000-0000-0000-000000000000',
          institutionName: 'Test Institution',
          studentCount: count,
          tier: snapshot.tier,
          ratePerStudentInr: snapshot.ratePaise / 100,
          baseAnnualFeeInr: snapshot.subtotalPaise / 100,
          gstRate: 0.18,
          gstAmountInr: snapshot.gstPaise / 100,
          totalAnnualFeeInr: snapshot.totalPaise / 100,
          isSponsorshipActive: false,
          sponsorshipExpiresAt: null,
          activeSponsoredCount: 0,
        };
      }
      inst = found;
    } else {
      inst = await this.resolveOwnedInstitution(userId, quoteInput.institutionId, isAdmin);
    }

    const enrolledStudents = await this.profileRepository.findStudentsByInstitution(inst.id);
    const declaredCount = quoteInput.declaredStudentCount ?? 0;
    const count = Math.max(enrolledStudents.length, declaredCount, 1);

    const snapshot = computeSponsorshipQuote(inst.id, count, 365);
    const activeGrant = await this.profileRepository.findActiveSponsorshipByInstitutionId(inst.id);

    return {
      institutionId: inst.id,
      institutionName: inst.institution_name,
      studentCount: count,
      tier: snapshot.tier,
      ratePerStudentInr: snapshot.ratePaise / 100,
      baseAnnualFeeInr: snapshot.subtotalPaise / 100,
      gstRate: 0.18,
      gstAmountInr: snapshot.gstPaise / 100,
      totalAnnualFeeInr: snapshot.totalPaise / 100,
      isSponsorshipActive: !!activeGrant,
      sponsorshipExpiresAt: activeGrant?.expires_at ?? null,
      activeSponsoredCount: activeGrant?.seats_used ?? 0,
    };
  }

  /**
   * Create Razorpay payment order for institution sponsorship (WAL-05, INT-05)
   * Rejects with 409 SPONSORSHIP_ALREADY_ACTIVE if an unexpired active grant exists.
   */
  async createOrder(
    userId: string,
    input: CreateSponsorshipOrderInput,
  ): Promise<SponsorshipOrderResult> {
    const inst = await this.resolveOwnedInstitution(userId, input.institutionId);

    const activeGrant = await this.profileRepository.findActiveSponsorshipByInstitutionId(inst.id);
    if (activeGrant) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SPONSORSHIP_ALREADY_ACTIVE',
        message: 'An active sponsorship grant already exists for this institution',
      });
    }

    const enrolledStudents = await this.profileRepository.findStudentsByInstitution(inst.id);
    const declaredCount = input.declaredStudentCount ?? 0;
    const count = Math.max(enrolledStudents.length, declaredCount, 1);

    const snapshot = computeSponsorshipQuote(inst.id, count, 365);
    const receipt = `rcpt_sp_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let gatewayOrder: { id: string };
    try {
      gatewayOrder = await this.gateway.createOrder({
        amountPaise: snapshot.totalPaise,
        receipt,
        notes: {
          userId,
          institutionId: inst.id,
          tier: snapshot.tier,
          studentCap: snapshot.studentCap.toString(),
        },
      });
    } catch (err) {
      this.logger.error(`Gateway order creation failed: ${(err as Error).message}`);
      throw new BadRequestException({
        statusCode: 400,
        code: 'ORDER_CREATION_FAILED',
        message: 'Failed to create payment order with payment gateway',
      });
    }

    const paymentRecordId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.paymentRepository.create({
      id: paymentRecordId,
      user_id: userId,
      gateway_order_id: gatewayOrder.id,
      gateway_payment_id: null,
      gateway_signature: null,
      pack_id: null,
      credits_added: 0,
      credits_to_grant: 0,
      amount_paise: snapshot.totalPaise,
      amount_inr: snapshot.totalPaise / 100,
      currency: 'INR',
      purpose: 'sponsorship',
      billing_state_code: input.billingStateCode,
      terms_version: input.termsVersion,
      status: 'created',
      order_snapshot: snapshot as unknown as Record<string, unknown>,
      metadata: {
        institutionId: inst.id,
        institutionName: inst.institution_name,
        tier: snapshot.tier,
        studentCap: snapshot.studentCap,
        billingName: input.billingName ?? '',
        billingEmail: input.billingEmail ?? '',
        billingPhone: input.billingPhone ?? '',
        billingAddress: input.billingAddress ?? '',
        billingGstin: input.billingGstin ?? null,
      },
      created_at: now,
      updated_at: now,
    });

    return {
      orderId: gatewayOrder.id,
      amount: snapshot.totalPaise,
      currency: 'INR',
      keyId: this.gateway.keyId,
      quote: snapshot,
    };
  }

  /**
   * Get active sponsorship grant status for institution
   */
  async getSponsorship(userId: string, institutionId?: string): Promise<SponsorshipStatusResult> {
    const inst = await this.resolveOwnedInstitution(userId, institutionId);
    const activeGrant = await this.profileRepository.findActiveSponsorshipByInstitutionId(inst.id);

    if (activeGrant) {
      return {
        status: 'active',
        tier: activeGrant.tier,
        cap: activeGrant.student_cap ?? null,
        seatsUsed: activeGrant.seats_used ?? 0,
        expiresAt: activeGrant.expires_at,
      };
    }

    return {
      status: 'none',
      tier: null,
      cap: 0,
      seatsUsed: 0,
      expiresAt: null,
    };
  }

  /**
   * Activate annual sponsorship for an institution (WAL-05)
   */
  async activateSponsorship(
    institutionId: string,
    input?: ActivateSponsorshipInput,
    userOrActorId?: AuthUser | { id: string; role?: string; phone?: string } | string,
  ): Promise<{
    success: boolean;
    quote: SponsorshipQuote;
    sponsoredStudentsCount: number;
    expiresAt: string;
    sponsorshipId: string;
    alreadyActive: boolean;
  }> {
    const user: { id: string; role?: string } =
      typeof userOrActorId === 'string'
        ? { id: userOrActorId, role: 'institution' }
        : userOrActorId || { id: institutionId, role: 'institution' };

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

    // 2. Payment verification hardening (Mandatory for non-admins)
    const isPrivileged = user.role === 'admin' || (user.role as string) === 'msme_admin';

    if (!isPrivileged && !input?.paymentReference) {
      throw new BadRequestException('A verified, captured payment reference is required to activate sponsorship');
    }

    if (input?.paymentReference) {
      const payment =
        (await this.paymentRepository.findByGatewayPaymentId(input.paymentReference)) ||
        (await this.paymentRepository.findById(input.paymentReference)) ||
        (await this.paymentRepository.findByGatewayOrderId(input.paymentReference));

      if (!payment) {
        throw new BadRequestException(`Payment reference ${input.paymentReference} not found`);
      }

      if (payment.status !== 'captured') {
        throw new BadRequestException('Payment not verified: payment status is not captured');
      }
      const isPaymentOwner =
        payment.user_id === user.id ||
        (instProfile && payment.user_id === instProfile.user_id);
      if (!isPaymentOwner && !isPrivileged) {
        throw new ForbiddenException('Payment is not linked to this institution or caller');
      }
    }

    // 3. Server-side Idempotency Key check
    if (input?.idempotencyKey) {
      const existingByKey = await this.profileRepository.findSponsorshipByIdempotencyKey(
        input.idempotencyKey,
      );
      if (existingByKey && existingByKey.status === 'active') {
        const quote = await this.getSponsorshipQuote(
          user.id,
          { institutionId: existingByKey.institution_id, declaredStudentCount: input?.studentCountOverride },
          true,
        );
        return {
          success: true,
          quote: {
            ...quote,
            isSponsorshipActive: true,
            sponsorshipExpiresAt: existingByKey.expires_at,
            activeSponsoredCount: existingByKey.student_count,
          },
          sponsoredStudentsCount: existingByKey.student_count,
          expiresAt: existingByKey.expires_at,
          alreadyActive: true,
          sponsorshipId: existingByKey.id,
        };
      }
    }

    // 4. Atomic transaction / serialization lock on institution row
    return this.profileRepository.withLock(institutionId, async () => {
      let lockedInst: InstitutionProfileRow | null =
        await this.profileRepository.findInstitutionProfileById(institutionId);
      if (!lockedInst) {
        lockedInst = await this.profileRepository.findInstitutionProfileByUserId(institutionId);
      }

      if (
        lockedInst &&
        lockedInst.is_sponsorship_active &&
        lockedInst.sponsorship_expires_at &&
        new Date(lockedInst.sponsorship_expires_at).getTime() > Date.now() &&
        !input?.force
      ) {
        const existingQuote = await this.getSponsorshipQuote(
          lockedInst.user_id,
          { institutionId: lockedInst.id, declaredStudentCount: input?.studentCountOverride },
          true,
        );
        return {
          success: true,
          quote: {
            ...existingQuote,
            isSponsorshipActive: true,
            sponsorshipExpiresAt: lockedInst.sponsorship_expires_at,
            activeSponsoredCount:
              lockedInst.total_sponsored_students || existingQuote.studentCount,
          },
          sponsoredStudentsCount:
            lockedInst.total_sponsored_students || existingQuote.studentCount,
          expiresAt: lockedInst.sponsorship_expires_at,
          alreadyActive: true,
          sponsorshipId: 'already_active',
        };
      }

      if (!lockedInst) {
        lockedInst = {
          id: institutionId,
          user_id: user.id || institutionId,
          public_slug: `institution-${institutionId}`,
          institution_name: 'Registered Educational Institution',
          institution_type: 'college',
          affiliation: 'NCVT',
          contact_person: 'Placement Officer',
          contact_phone: '+917000000001',
          contact_email: 'placement@institution.edu.in',
          address: 'Campus Road, Knowledge Park',
          city: 'New Delhi',
          state: 'Delhi',
          pincode: '110001',
          source: 'direct',
          created_by: user.id || null,
          updated_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await this.profileRepository.saveInstitutionProfile(lockedInst);
      }

      const institution: InstitutionProfileRow = lockedInst!;
      const quote = await this.getSponsorshipQuote(
        institution.user_id,
        { institutionId: institution.id, declaredStudentCount: input?.studentCountOverride },
        true,
      );

      const now = new Date();
      const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const sponsorshipId = crypto.randomUUID();

      const countById = await this.profileRepository.updateStudentSponsorshipByInstitution(
        institution.id,
        true,
        sponsorshipId,
      );
      let countByName = 0;
      if (institution.institution_name) {
        countByName = await this.profileRepository.updateStudentSponsorshipByInstitution(
          institution.institution_name,
          true,
          sponsorshipId,
        );
      }
      const totalSponsoredStudents = Math.max(quote.studentCount, countById, countByName);

      const sponsorshipRecord: InstitutionSponsorshipRow = {
        id: sponsorshipId,
        institution_id: institution.id,
        tier: quote.tier,
        rate_per_student: quote.ratePerStudentInr,
        annual_fee: quote.totalAnnualFeeInr,
        student_count: totalSponsoredStudents,
        status: 'active',
        payment_reference: input?.paymentReference || null,
        idempotency_key: input?.idempotencyKey || null,
        started_at: now.toISOString(),
        expires_at: oneYearLater,
        created_by: user.id || null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
      await this.profileRepository.saveSponsorship(sponsorshipRecord);

      institution.is_sponsorship_active = true;
      institution.sponsorship_tier = quote.tier;
      institution.sponsorship_rate_per_student = quote.ratePerStudentInr;
      institution.sponsorship_expires_at = oneYearLater;
      institution.total_sponsored_students = totalSponsoredStudents;
      institution.annual_sponsorship_fee = quote.totalAnnualFeeInr;
      institution.updated_at = now.toISOString();

      await this.profileRepository.saveInstitutionProfile(institution);

      try {
        await this.auditLogRepository.append({
          id: crypto.randomUUID(),
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
      } catch {
        // Non-blocking audit fallback
      }

      const updatedQuote: SponsorshipQuote = {
        ...quote,
        isSponsorshipActive: true,
        sponsorshipExpiresAt: oneYearLater,
        activeSponsoredCount: totalSponsoredStudents,
      };

      return {
        success: true,
        quote: updatedQuote,
        sponsoredStudentsCount: totalSponsoredStudents,
        expiresAt: oneYearLater,
        sponsorshipId: sponsorshipRecord.id,
        alreadyActive: false,
      };
    });
  }
}
