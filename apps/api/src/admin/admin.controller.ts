import { Controller, Get, Post, Put, Body, Param, Query, Inject, UsePipes, UseGuards, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { AdminService } from './admin.service.js';
import { BroadcastService } from './broadcast.service.js';
import { ReportsService } from './reports.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';
import {
  adminUserStatusSchema,
  adminUserRoleSchema,
  auditLogSchema,
  privacyRequestSchema,
  generateResumeSchema,
  costPreviewRequestSchema,
  dispatchBroadcastSchema,
  adminExportQuerySchema,
} from '@indian-job-portal/validation';

export class AdminUserStatusDto extends createZodDto(adminUserStatusSchema) {}
export class AdminUserRoleDto extends createZodDto(adminUserRoleSchema) {}
export class AuditLogDto extends createZodDto(auditLogSchema) {}
export class PrivacyRequestDto extends createZodDto(privacyRequestSchema) {}
export class GenerateResumeDto extends createZodDto(generateResumeSchema) {}
export class CostPreviewRequestDto extends createZodDto(costPreviewRequestSchema) {}
export class DispatchBroadcastDto extends createZodDto(dispatchBroadcastSchema) {}
export class AdminExportQueryDto extends createZodDto(adminExportQuerySchema) {}

@Controller()
@UsePipes(ZodValidationPipe)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(BroadcastService) private readonly broadcastService: BroadcastService,
    @Inject(ReportsService) private readonly reportsService: ReportsService,
  ) {}

  // Issue #21 & P0-8: Admin User Role Update
  @Put('admin/users/:id/role')
  @Roles('admin')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async updateUserRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AdminUserRoleDto,
  ) {
    if (!user?.id) throw new UnauthorizedException("Authentication required");
    const callerId = user.id;
    return this.adminService.updateUserRole(id, body.role, callerId, body.reason);
  }

  // Issue #21: Admin User Status Update
  @Put('admin/users/:id/status')
  @Roles('admin')
  async updateUserStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AdminUserStatusDto,
  ) {
    if (!user?.id) throw new UnauthorizedException("Authentication required");
    const callerId = user.id;
    return this.adminService.updateUserStatus(id, body, callerId);
  }

  // Issue #22: Audit Log Append-Only
  @Get('admin/audit-logs')
  @Roles('admin')
  async getAuditLogs() {
    return this.adminService.getAuditLogs();
  }

  @Post('admin/audit-logs')
  @Roles('admin')
  async createAuditLog(
    @CurrentUser() user: AuthUser,
    @Body() body: AuditLogDto,
  ) {
    if (!user?.id) throw new UnauthorizedException("Authentication required");
    const callerId = user.id;
    return this.adminService.recordAuditLog(callerId, body.action, body.meta);
  }

  // Issue #33 & ADM-04: Data Export Restricted to Admin & Logged
  @Get('admin/export')
  @Roles('admin')
  async exportData(
    @CurrentUser() user: AuthUser,
    @Query() query: AdminExportQueryDto,
  ) {
    if (!user?.id) throw new UnauthorizedException("Authentication required");
    const adminId = user.id;
    return this.adminService.exportData(adminId, query);
  }

  // Issue #23: In-App Notifications (NOT-03)
  @Get('notifications')
  async getNotifications(
    @CurrentUser() user: AuthUser,
  ) {
    if (!user?.id) throw new UnauthorizedException("Authentication required");
    const callerId = user.id;
    return this.adminService.getNotifications(callerId);
  }

  @Put('notifications/:id/read')
  async markNotificationRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    if (!user?.id) throw new UnauthorizedException("Authentication required");
    const callerId = user.id;
    return this.adminService.markNotificationRead(callerId, id);
  }

  // Issue #24: Privacy DPDP Deletion Request
  @Post('privacy/request-deletion')
  async requestAccountDeletion(
    @CurrentUser() user: AuthUser,
    @Body() body: PrivacyRequestDto,
  ) {
    if (!user?.id) throw new UnauthorizedException("Authentication required");
    const callerId = user.id;
    return this.adminService.requestAccountDeletion(callerId, body.reason);
  }

  // Issue #30: Resume Builder (JS-04)
  @Post('resume/generate')
  async generateResume(@Body() body: GenerateResumeDto) {
    return this.adminService.generateResume(body);
  }

  // Issue #32: ADM-02 Full Admin Reports & Analytics
  @Get('admin/reports/analytics')
  @Roles('admin')
  async getAnalyticsReports() {
    return this.adminService.getAnalyticsReports();
  }

  // Ticket T-20: MSME Department Broadcast Engine & Dynamic Cost Preview (MSME-03)
  @Post('admin/broadcast/preview')
  @Roles('admin', 'msme_admin')
  async getBroadcastCostPreview(@Body() body: CostPreviewRequestDto) {
    return this.broadcastService.calculateCostPreview(body);
  }

  @Post('admin/broadcast/dispatch')
  @Roles('admin', 'msme_admin')
  async dispatchBroadcast(
    @CurrentUser() user: AuthUser,
    @Body() body: DispatchBroadcastDto,
  ) {
    if (!user?.id) throw new UnauthorizedException("Authentication required");
    const actor = { id: user.id, role: user.role };
    return this.broadcastService.dispatchBroadcast(actor, body);
  }

  // Ticket T-20: District Employment Reports (MSME-04 & Zero PII Invariant #1)
  @Get('admin/reports/district-employment')
  @Roles('admin', 'msme_admin')
  async getDistrictEmploymentReports(
    @CurrentUser() user: AuthUser,
  ) {
    if (!user?.id) throw new UnauthorizedException("Authentication required");
    const actor = { id: user.id, role: user.role };
    return this.reportsService.getDistrictEmploymentReports(actor);
  }
}
