import type { FastifyReply, FastifyRequest } from 'fastify';
import type {} from '@fastify/multipart';
import { BadRequestException, Controller, Get, Post, Put, Body, Param, Headers, Req, Res, Inject, UsePipes, UseGuards, PayloadTooLargeException } from '@nestjs/common';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { BulkService } from './bulk.service.js';
import { QstashSignatureGuard } from '../qstash/qstash-signature.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import {
  bulkUploadSchema,
  bulkRosterMetadataSchema,
  inviteWaveSchema,
  updateWaveStatusSchema,
} from '@indian-job-portal/validation';

export class BulkUploadDto extends createZodDto(bulkUploadSchema) {}
export class InviteWaveDto extends createZodDto(inviteWaveSchema) {}
export class UpdateWaveStatusDto extends createZodDto(updateWaveStatusSchema) {}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class BulkController {
  constructor(@Inject(BulkService) private readonly bulkService: BulkService) {}

  @Roles('admin', 'intermediary', 'msme_admin')
  @Post('bulk/batches/file')
  async uploadRoster(@Req() req: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const fields: Record<string, unknown> = Object.create(null);
    let file: { bytes: Buffer; isWorkbook: boolean } | undefined;
    try {
      for await (const part of req.parts({ limits: { files: 1, fields: 2, fileSize: 16 * 1024 * 1024, fieldSize: 1024 } })) {
        if (part.type === 'file') {
          if (part.fieldname !== 'file' || !/\.(csv|xlsx)$/i.test(part.filename)) {
            throw new BadRequestException({ code: 'BULK_FILE_FORMAT' });
          }
          file = { bytes: await part.toBuffer(), isWorkbook: /\.xlsx$/i.test(part.filename) };
        } else {
          if (part.fieldname in fields || part.valueTruncated) {
            throw new BadRequestException('BULK_UPLOAD_INVALID');
          }
          fields[part.fieldname] = part.value;
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Error && 'statusCode' in error && error.statusCode === 413) {
        throw new PayloadTooLargeException('BULK_UPLOAD_LIMIT');
      }
      throw new BadRequestException('BULK_UPLOAD_INVALID');
    }
    const metadata = bulkRosterMetadataSchema.strict().safeParse(fields);
    if (!file || !metadata.success) {
      throw new BadRequestException('BULK_UPLOAD_INVALID');
    }
    return this.bulkService.processRosterFile(metadata.data, file.bytes, user, file.isWorkbook);
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
