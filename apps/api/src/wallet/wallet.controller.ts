import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Header,
  UsePipes,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { WalletService } from './wallet.service.js';
import { PaymentService } from './payment.service.js';
import {
  grantCreditSchema,
  unlockContactSchema,
  featureJobSchema,
  configureCostSchema,
  createPaymentOrderSchema,
  verifyPaymentSchema,
  CREDIT_PACKS,
  type GrantCreditInput,
  type UnlockContactInput,
  type FeatureJobInput,
  type ConfigureCostInput,
  type CreatePaymentOrderInput,
  type VerifyPaymentInput,
} from '@indian-job-portal/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';
import { RequireFeatureFlag } from '../auth/guards/feature-flag.guard.js';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class WalletController {
  constructor(
    @Inject(WalletService) private readonly walletService: WalletService,
    @Inject(PaymentService) private readonly paymentService: PaymentService,
  ) {}

  // List available pre-configured credit packs (P2 Recharge)
  @Get('packs')
  @RequireFeatureFlag('ENABLE_P2_WALLET_RECHARGE')
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
  @Post('recharge/create-order')
  @RequireFeatureFlag('ENABLE_P2_PAYMENTS')
  async createRechargeOrder(
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePaymentOrderInput,
  ) {
    const validated = createPaymentOrderSchema.parse(body);
    return this.paymentService.createOrder(user.id, validated);
  }

  // Verify and capture direct client checkout payment (WAL-03)
  @Post('recharge/verify')
  @RequireFeatureFlag('ENABLE_P2_PAYMENTS')
  async verifyPayment(
    @CurrentUser() user: AuthUser,
    @Body() body: VerifyPaymentInput,
  ) {
    const validated = verifyPaymentSchema.parse(body);

    const isValid = this.paymentService.verifyClientPaymentSignature(
      validated.razorpayOrderId,
      validated.razorpayPaymentId,
      validated.razorpaySignature,
    );

    if (!isValid) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_SIGNATURE',
        message: 'Invalid payment signature from Razorpay checkout',
      });
    }

    return this.paymentService.processPaymentSuccess(
      validated.razorpayOrderId,
      validated.razorpayPaymentId,
      validated.razorpaySignature,
      { verifiedBy: 'client_checkout', verifiedByUserId: user.id },
    );
  }

  // Download / view structured GST Tax Invoice for successful payment (WAL-03)
  @Get('invoice/:paymentId')
  @RequireFeatureFlag('ENABLE_P2_PAYMENTS')
  async getInvoice(
    @CurrentUser() user: AuthUser,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.getInvoice(paymentId, user.id, user.role === 'admin');
  }

  // Render downloadable HTML GST Tax Invoice
  @Get('invoice/:paymentId/html')
  @RequireFeatureFlag('ENABLE_P2_PAYMENTS')
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
  async grantCredits(@CurrentUser() user: AuthUser, @Body() body: GrantCreditInput) {
    const validated = grantCreditSchema.parse(body);
    return this.walletService.grantCredits(
      validated.userId,
      validated.amount,
      validated.reason,
      user.id,
    );
  }

  // Employer unlocks candidate contact details
  @Roles('employer', 'admin')
  @Post('unlock-contact')
  async unlockContact(@CurrentUser() user: AuthUser, @Body() body: UnlockContactInput) {
    const validated = unlockContactSchema.parse(body);
    return this.walletService.unlockCandidateContact(
      user.id,
      validated.seekerId,
      validated.cost,
    );
  }

  // Employer features a job
  @Roles('employer', 'admin')
  @Post('feature-job')
  @RequireFeatureFlag('ENABLE_P2_FEATURED_PROMOTIONS')
  async featureJob(@CurrentUser() user: AuthUser, @Body() body: FeatureJobInput) {
    const validated = featureJobSchema.parse(body);
    return this.walletService.featureJob(
      user.id,
      validated.jobId,
      validated.cost,
    );
  }

  // View configured action costs (WAL-04)
  @Get('costs')
  async getActionCosts() {
    return this.walletService.getAllActionCosts();
  }

  // Admin configures action costs (WAL-04)
  @Roles('admin')
  @Put('costs')
  async configureCost(@Body() body: ConfigureCostInput) {
    const validated = configureCostSchema.parse(body);
    this.walletService.setActionCost(validated.action, validated.cost);
    return {
      success: true,
      action: validated.action,
      cost: validated.cost,
    };
  }
}
