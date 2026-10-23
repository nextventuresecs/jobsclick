import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { BroadcastService } from './broadcast.service.js';
import { ReportsService } from './reports.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { QueueModule } from '../queue/queue.module.js';

@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [AdminController],
  providers: [AdminService, BroadcastService, ReportsService],
  exports: [AdminService, BroadcastService, ReportsService],
})
export class AdminModule {}
