import { Module } from '@nestjs/common';
import { BulkController } from './bulk.controller.js';
import { BulkService } from './bulk.service.js';
import { QstashModule } from '../qstash/qstash.module.js';

@Module({
  imports: [QstashModule],
  controllers: [BulkController],
  providers: [BulkService],
  exports: [BulkService],
})
export class BulkModule {}
