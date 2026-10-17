import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { WalletModule } from '../wallet/wallet.module.js';

@Module({
  imports: [DatabaseModule, WalletModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
