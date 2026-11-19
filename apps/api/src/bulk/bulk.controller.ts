import type { FastifyReply } from 'fastify';
import { Controller, Get, Post, Put, Body, Param, Headers, Res, Inject, UsePipes, UseGuards } from '@nestjs/common';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { BulkService } from './bulk.service.js';
import { QstashSignatureGuard } from '../qstash/qstash-signature.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class BulkController {
  constructor(@Inject(BulkService) private readonly bulkService: BulkService) {}

  @Roles('admin', 'intermediary', 'msme_admin')
  @Post('bulk/signed-url')
  async getSignedUploadUrl(@Body(new ZodValidationPipe(signedUrlSchema)) body: SignedUrlDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bulkService.getSignedUploadUrl(body.fileName, body.contentType, user);
  }

  @Roles('admin', 'intermediary', 'msme_admin')
  @Post('bulk/batches')
  async uploadCsv(@Body(new ZodValidationPipe(bulkUploadSchema)) body: BulkUploadDto, @CurrentUser() user: AuthenticatedUser) {
    const csvContent = body.csvContent;
    return this.bulkService.processBulkImport(body, csvContent, user);
  }

  @Public()
  @Post('webhooks/qstash/import-batch')
  @UseGuards(QstashSignatureGuard)
  async handleImportBatchWebhook(@Body() payload: { batchId: string; source?: string; entityType?: 'student' | 'employer'; csvContent?: string }) {
    return this.bulkService.executeImportBatchJob(payload.batchId, payload);
  }

  @Public()
  @Post('webhooks/qstash/send-invite-wave')
  @UseGuards(QstashSignatureGuard)
  async handleSendInviteWaveWebhook(@Body() payload: { waveId: string }) {
    return this.bulkService.executeInviteWaveJob(payload.waveId);
  }

  @Roles('admin', 'intermediary', 'msme_admin')
  @Get('bulk/batches/:id')
  async getBatchStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bulkService.getBatchStatus(id, user);
  }

  @Roles('admin', 'intermediary', 'msme_admin')
  @Get('bulk/batches/:id/error-report')
  async downloadErrorCsv(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const csv = await this.bulkService.getBatchErrorCsv(id, user);
    reply.type('text/csv');
    return csv;
  }

  @Roles('admin', 'intermediary')
  @Post('bulk/invites/preview')
  async previewInviteWave(@Body(new ZodValidationPipe(inviteWaveSchema)) body: InviteWaveDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bulkService.previewInviteWave(body, user);
  }

  @Roles('admin', 'intermediary')
  @Post('bulk/invites/schedule')
  async scheduleInviteWave(@Body(new ZodValidationPipe(inviteWaveSchema)) body: InviteWaveDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bulkService.scheduleInviteWave(body, 0, user);
  }

  @Roles('admin', 'intermediary')
  @Put('bulk/invites/waves/:waveId')
  async updateWaveStatus(
    @Param('waveId') waveId: string,
    @Body(new ZodValidationPipe(updateWaveStatusSchema)) body: UpdateWaveStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bulkService.updateWaveStatus(waveId, body.action, user);
  }

  @Roles('admin')
  @Get('admin/metrics')
  async getLaunchMetrics() {
    return this.bulkService.getLaunchMetrics();
  }

  @Roles('admin')
  @Get('admin/queues')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getQueueStatus(@Headers('accept') accept?: string, @Res({ passthrough: true }) res?: any) {
    if (accept && accept.includes('text/html') && res && typeof res.redirect === 'function') {
      return res.redirect('/admin/queues/ui');
    }
    return this.bulkService.getQueueStatus();
  }
}
