import { Controller, Get, Post, Put, Body, Param, Header, Headers, Res, Inject, UsePipes, UseGuards } from '@nestjs/common';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { BulkService } from './bulk.service.js';
import { QstashSignatureGuard } from '../qstash/qstash-signature.guard.js';
import {
  bulkUploadSchema,
  signedUrlSchema,
  inviteWaveSchema,
  updateWaveStatusSchema,
} from '@indian-job-portal/validation';

export class BulkUploadDto extends createZodDto(bulkUploadSchema) {}
export class SignedUrlDto extends createZodDto(signedUrlSchema) {}
export class InviteWaveDto extends createZodDto(inviteWaveSchema) {}
export class UpdateWaveStatusDto extends createZodDto(updateWaveStatusSchema) {}

@Controller()
@UsePipes(ZodValidationPipe)
export class BulkController {
  constructor(@Inject(BulkService) private readonly bulkService: BulkService) {}

  @Post('bulk/signed-url')
  async getSignedUploadUrl(@Body() body: SignedUrlDto) {
    return this.bulkService.getSignedUploadUrl(body.fileName, body.contentType);
  }

  @Post('bulk/batches')
  async uploadCsv(@Body() body: BulkUploadDto) {
    const csvContent = body.csvContent;
    return this.bulkService.processBulkImport(body, csvContent);
  }

  @Post('webhooks/qstash/import-batch')
  @UseGuards(QstashSignatureGuard)
  async handleImportBatchWebhook(@Body() payload: { batchId: string; source?: string; entityType?: 'student' | 'employer'; csvContent?: string }) {
    return this.bulkService.executeImportBatchJob(payload.batchId, payload);
  }

  @Post('webhooks/qstash/send-invite-wave')
  @UseGuards(QstashSignatureGuard)
  async handleSendInviteWaveWebhook(@Body() payload: { waveId: string }) {
    return this.bulkService.executeInviteWaveJob(payload.waveId);
  }

  @Get('bulk/batches/:id')
  async getBatchStatus(@Param('id') id: string) {
    return this.bulkService.getBatchStatus(id);
  }

  @Get('bulk/batches/:id/error-report')
  @Header('Content-Type', 'text/csv')
  async downloadErrorCsv(@Param('id') id: string) {
    return this.bulkService.getBatchErrorCsv(id);
  }

  @Post('bulk/invites/preview')
  async previewInviteWave(@Body() body: InviteWaveDto) {
    return this.bulkService.previewInviteWave(body);
  }

  @Post('bulk/invites/schedule')
  async scheduleInviteWave(@Body() body: InviteWaveDto) {
    return this.bulkService.scheduleInviteWave(body);
  }

  @Put('bulk/invites/waves/:waveId')
  async updateWaveStatus(@Param('waveId') waveId: string, @Body() body: UpdateWaveStatusDto) {
    return this.bulkService.updateWaveStatus(waveId, body.action);
  }

  @Get('admin/metrics')
  async getLaunchMetrics() {
    return this.bulkService.getLaunchMetrics();
  }

  @Get('admin/queues')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getQueueStatus(@Headers('accept') accept?: string, @Res({ passthrough: true }) res?: any) {
    if (accept && accept.includes('text/html') && res && typeof res.redirect === 'function') {
      return res.redirect('/admin/queues/');
    }
    return this.bulkService.getQueueStatus();
  }
}
