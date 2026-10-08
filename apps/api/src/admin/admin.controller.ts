import { Controller, Get, Post, Put, Body, Param, Headers, Inject, UsePipes } from '@nestjs/common';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { AdminService } from './admin.service.js';
import {
  adminUserStatusSchema,
  auditLogSchema,
  privacyRequestSchema,
} from '@indian-job-portal/validation';

export class AdminUserStatusDto extends createZodDto(adminUserStatusSchema) {}
export class AuditLogDto extends createZodDto(auditLogSchema) {}
export class PrivacyRequestDto extends createZodDto(privacyRequestSchema) {}

@Controller()
@UsePipes(ZodValidationPipe)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

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
}
