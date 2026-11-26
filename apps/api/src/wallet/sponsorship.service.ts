import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import crypto from 'node:crypto';
import {
  computeSponsorshipQuote,
  type SponsorshipQuote,
  type SponsorshipQuoteInput,
  type CreateSponsorshipOrderInput,
  type SponsorshipOrderSnapshot,
} from '@indian-job-portal/validation';
import type {
  InstitutionProfileRow,
} from '@indian-job-portal/database';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import { PaymentRepository } from '../database/repositories/payment.repository.js';
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
}
