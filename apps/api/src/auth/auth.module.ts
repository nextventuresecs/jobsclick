import { Module, Global } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Msg91SmsService } from './sms.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Global()
@Module({
  imports: [DatabaseModule, WalletModule],
  controllers: [AuthController],
  providers: [AuthService, Msg91SmsService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, Msg91SmsService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
