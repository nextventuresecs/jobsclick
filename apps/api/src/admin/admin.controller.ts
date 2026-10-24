import { Controller, Get, Post, Put, Body, Param, Headers, Inject, UsePipes } from '@nestjs/common';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { AdminService } from './admin.service.js';
import { BroadcastService } from './broadcast.service.js';
import { ReportsService } from './reports.service.js';
import {
  adminUserStatusSchema,
  auditLogSchema,
  privacyRequestSchema,
  generateResumeSchema,
  costPreviewRequestSchema,
  dispatchBroadcastSchema,
} from '@indian-job-portal/validation';

export class AdminUserStatusDto extends createZodDto(adminUserStatusSchema) {}
export class AuditLogDto extends createZodDto(auditLogSchema) {}
export class PrivacyRequestDto extends createZodDto(privacyRequestSchema) {}
export class GenerateResumeDto extends createZodDto(generateResumeSchema) {}
export class CostPreviewRequestDto extends createZodDto(costPreviewRequestSchema) {}
export class DispatchBroadcastDto extends createZodDto(dispatchBroadcastSchema) {}

@Controller()
@UsePipes(ZodValidationPipe)
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(BroadcastService) private readonly broadcastService: BroadcastService,
    @Inject(ReportsService) private readonly reportsService: ReportsService,
  ) {}

  // Issue #21: Admin User Status Update
  @Put('admin/users/:id/status')
  async updateUserStatus(@Param('id') id: string, @Body() body: AdminUserStatusDto) {
    return this.adminService.updateUserStatus(id, body);
  }

  // Issue #22: Audit Log Append-Only
  @Get('admin/audit-logs')
  async getAuditLogs() {
    return this.adminService.getAuditLogs();
  }

  @Post('admin/audit-logs')
  async createAuditLog(@Headers('x-user-id') actorId: string, @Body() body: AuditLogDto) {
    return this.adminService.recordAuditLog(actorId || 'admin_root', body.action, body.meta);
  }

  // Issue #23: In-App Notifications (NOT-03)
  @Get('notifications')
  async getNotifications(@Headers('x-user-id') userId: string) {
    return this.adminService.getNotifications(userId || 'usr_seeker_1');
  }

  @Put('notifications/:id/read')
  async markNotificationRead(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.adminService.markNotificationRead(userId || 'usr_seeker_1', id);
  }

  // Issue #24: Privacy DPDP Deletion Request
  @Post('privacy/request-deletion')
  async requestAccountDeletion(@Headers('x-user-id') userId: string, @Body() body: PrivacyRequestDto) {
    return this.adminService.requestAccountDeletion(userId || 'usr_seeker_1', body.reason);
  }

  // Issue #30: Resume Builder (JS-04)
  @Post('resume/generate')
  async generateResume(@Body() body: GenerateResumeDto) {
    return this.adminService.generateResume(body);
  }

  // Issue #32: ADM-02 Full Admin Reports & Analytics
  @Get('admin/reports/analytics')
  async getAnalyticsReports() {
    return this.adminService.getAnalyticsReports();
  }

  // Ticket T-20: MSME Department Broadcast Engine & Dynamic Cost Preview (MSME-03)
  @Post('admin/broadcast/preview')
  async getBroadcastCostPreview(@Body() body: CostPreviewRequestDto) {
    return this.broadcastService.calculateCostPreview(body);
  }

  @Post('admin/broadcast/dispatch')
  async dispatchBroadcast(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') role: string,
    @Body() body: DispatchBroadcastDto,
  ) {
    const actor = {
      id: userId || 'admin_root',
      role: role || 'admin',
    };
    return this.broadcastService.dispatchBroadcast(actor, body);
  }

  // Ticket T-20: District Employment Reports (MSME-04 & Zero PII Invariant #1)
  @Get('admin/reports/district-employment')
  async getDistrictEmploymentReports(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') role: string,
  ) {
    const actor = {
      id: userId || 'admin_root',
      role: role || 'admin',
    };
    return this.reportsService.getDistrictEmploymentReports(actor);
  }
}
