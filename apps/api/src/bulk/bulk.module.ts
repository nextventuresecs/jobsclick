import { Module } from '@nestjs/common';
import { BulkController } from './bulk.controller.js';
import { BulkService } from './bulk.service.js';
import { QstashModule } from '../qstash/qstash.module.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [QstashModule, DatabaseModule],
  controllers: [BulkController],
  providers: [BulkService],
  exports: [BulkService],
})
export class BulkModule {}
