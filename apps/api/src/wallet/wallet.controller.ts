import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Header,
  UsePipes,
  UseGuards,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Throttle } from '@nestjs/throttler';
import { WalletService } from './wallet.service.js';
import { PaymentService } from './payment.service.js';
import { PaymentRepository } from '../database/repositories/payment.repository.js';
import {
  CREDIT_PACKS,
  createPaymentOrderSchema,
  verifyPaymentSchema,
  grantCreditSchema,
  unlockContactSchema,
} from '@indian-job-portal/validation';
import {
  CreatePaymentOrderDto,
  VerifyPaymentDto,
  GrantCreditDto,
  UnlockContactDto,
} from './dto/wallet.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class WalletController {
  constructor(
    @Inject(WalletService) private readonly walletService: WalletService,
    @Inject(PaymentService) private readonly paymentService: PaymentService,
    @Inject(PaymentRepository) private readonly paymentRepository: PaymentRepository,
  ) {}

  // List available pre-configured credit packs (P2 Recharge)
  @Get('packs')
  async getCreditPacks() {
    return Object.values(CREDIT_PACKS);
  }

  // Current user views their dynamically calculated balance (WAL-01, Hard Invariant #7)
  @Get('balance')
  async getBalance(@CurrentUser() user: AuthUser) {
    return this.walletService.getBalance(user.id);
  }

  // Current user views their credit ledger history
  @Get('transactions')
  async getLedger(@CurrentUser() user: AuthUser) {
    return this.walletService.getLedger(user.id);
  }

  // Create Razorpay recharge order (WAL-03)
  // 10/h/user rate limit
  @Roles('job_seeker', 'employer', 'admin')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post('recharge/create-order')
  async createRechargeOrder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPaymentOrderSchema)) body: CreatePaymentOrderDto,
  ) {
    return this.paymentService.createOrder(user.id, body);
  }

  // Verify and capture direct client checkout payment (WAL-03)
  // 30/h/user rate limit; order owner only (404 on non-owner or unknown order)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @Post('recharge/verify')
  async verifyPayment(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(verifyPaymentSchema)) body: VerifyPaymentDto,
  ): Promise<{ status: 'settled' | 'pending'; balance: number }> {
    const isValid = this.paymentService.verifyClientPaymentSignature(
      body.razorpayOrderId,
      body.razorpayPaymentId,
      body.razorpaySignature,
    );

    if (!isValid) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_SIGNATURE',
        message: 'Invalid payment signature from Razorpay checkout',
      });
    }

    const orderRecord = await this.paymentRepository.findByGatewayOrderId(body.razorpayOrderId);
    if (!orderRecord || orderRecord.user_id !== user.id) {
      // Non-owner or unknown order → 404 (no existence leak)
      throw new NotFoundException('Order not found');
    }

    const outcome = await this.paymentService.settleFromGateway(
      body.razorpayOrderId,
      body.razorpayPaymentId,
      'client_verify',
    );

    const balanceRes = await this.walletService.getBalance(user.id);

    return {
      status: outcome.status === 'pending' ? 'pending' : 'settled',
      balance: balanceRes.balance,
    };
  }

  // Download / view structured GST Tax Invoice for successful payment (WAL-03)
  @Get('invoice/:paymentId')
  async getInvoice(
    @CurrentUser() user: AuthUser,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.getInvoice(paymentId, user.id, user.role === 'admin');
  }

  // Render downloadable HTML GST Tax Invoice
  @Get('invoice/:paymentId/html')
  @Header('Content-Type', 'text/html')
  async getInvoiceHtml(
    @CurrentUser() user: AuthUser,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.getInvoiceHtml(paymentId, user.id, user.role === 'admin');
  }

  // Admin or platform grants credits
  @Roles('admin')
  @Post('grant')
  async grantCredits(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(grantCreditSchema)) body: GrantCreditDto,
  ) {
    return this.walletService.recordTransaction({
      userId: body.userId,
      amount: body.amount,
      reason: body.reason,
      actorId: user.id,
    });
  }

  // Employer unlocks candidate contact details
  @Roles('employer', 'admin')
  @Post('unlock-contact')
  async unlockContact(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(unlockContactSchema)) body: UnlockContactDto,
  ) {
    return this.walletService.unlockCandidateContact(
      user.id,
      body.seekerId,
      body.cost,
    );
  }
}
