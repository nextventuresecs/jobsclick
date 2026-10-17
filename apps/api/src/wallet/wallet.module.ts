import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { WalletService } from './wallet.service.js';
import { WalletController } from './wallet.controller.js';
import { PaymentService } from './payment.service.js';
import { RazorpayWebhookController } from './razorpay.webhook.js';

@Module({
  imports: [DatabaseModule],
  controllers: [WalletController, RazorpayWebhookController],
  providers: [WalletService, PaymentService],
  exports: [WalletService, PaymentService],
})
export class WalletModule {}
