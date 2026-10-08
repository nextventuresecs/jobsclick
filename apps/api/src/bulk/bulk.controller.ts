import { Controller, Get, Post, Put, Body, Param, Header, Inject, UsePipes } from '@nestjs/common';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { BulkService } from './bulk.service.js';
import {
  bulkUploadSchema,
  inviteWaveSchema,
  updateWaveStatusSchema,
} from '@indian-job-portal/validation';

export class BulkUploadDto extends createZodDto(bulkUploadSchema) {}
export class InviteWaveDto extends createZodDto(inviteWaveSchema) {}
export class UpdateWaveStatusDto extends createZodDto(updateWaveStatusSchema) {}

@Controller()
@UsePipes(ZodValidationPipe)
export class BulkController {
  constructor(@Inject(BulkService) private readonly bulkService: BulkService) {}

  // BULK-01, BULK-06: CSV Upload
  @Post('bulk/batches')
  async uploadCsv(@Body() body: BulkUploadDto) {
    const csvContent = body.csvContent || 'name,phone\nAnita,9876543210';
    return this.bulkService.processBulkImport(body, csvContent);
  }

  // BULK-04: Batch status & progress
  @Get('bulk/batches/:id')
  async getBatchStatus(@Param('id') id: string) {
    return this.bulkService.getBatchStatus(id);
  }

  // BULK-02: Downloadable Error CSV
  @Get('bulk/batches/:id/error-report')
  @Header('Content-Type', 'text/csv')
  async downloadErrorCsv(@Param('id') id: string) {
    return this.bulkService.getBatchErrorCsv(id);
  }

  // BULK-03: Cost Preview
  @Post('bulk/invites/preview')
  async previewInviteWave(@Body() body: InviteWaveDto) {
    return this.bulkService.previewInviteWave(body);
  }

  // BULK-03 & Issue #38: Schedule Wave
  @Post('bulk/invites/schedule')
  async scheduleInviteWave(@Body() body: InviteWaveDto) {
    return this.bulkService.scheduleInviteWave(body);
  }

  // Issue #38: Pause / Resume / Cancel Wave
  @Put('bulk/invites/waves/:waveId')
  async updateWaveStatus(@Param('waveId') waveId: string, @Body() body: UpdateWaveStatusDto) {
    return this.bulkService.updateWaveStatus(waveId, body.action);
  }

  // Issue #39: Launch Metrics
  @Get('admin/metrics')
  async getLaunchMetrics() {
    return this.bulkService.getLaunchMetrics();
  }

  // Issue #19: bull-board queue status
  @Get('admin/queues')
  async getQueueStatus() {
    return this.bulkService.getQueueStatus();
  }
}
