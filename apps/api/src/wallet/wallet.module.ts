import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { WalletService } from './wallet.service.js';
import { WalletController } from './wallet.controller.js';
import { PaymentService } from './payment.service.js';
import { RazorpayWebhookController } from './razorpay.webhook.js';
import { SponsorshipService } from './sponsorship.service.js';
import { InstitutionSponsorshipController } from './institution-sponsorship.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [
    WalletController,
    RazorpayWebhookController,
    InstitutionSponsorshipController,
  ],
  providers: [WalletService, PaymentService, SponsorshipService],
  exports: [WalletService, PaymentService, SponsorshipService],
})
export class WalletModule {}
