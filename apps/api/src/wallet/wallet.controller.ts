import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UsePipes,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { WalletService } from './wallet.service.js';
import {
  grantCreditSchema,
  unlockContactSchema,
  featureJobSchema,
  configureCostSchema,
  type GrantCreditInput,
  type UnlockContactInput,
  type FeatureJobInput,
  type ConfigureCostInput,
} from '@indian-job-portal/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class WalletController {
  constructor(@Inject(WalletService) private readonly walletService: WalletService) {}

  // Current user views their dynamically calculated balance
  @Get('balance')
  async getBalance(@CurrentUser() user: AuthUser) {
    return this.walletService.getBalance(user.id);
  }

  // Current user views their credit ledger history
  @Get('transactions')
  async getTransactions(@CurrentUser() user: AuthUser) {
    return this.walletService.getLedger(user.id);
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
