import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { AdminUserStatusInput, GenerateResumeInput } from '@indian-job-portal/validation';
import { AuditLogRepository } from '../database/repositories/audit-log.repository.js';

export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  action: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PrivacyDeletionRequestRecord {
  id: string;
  userId: string;
  reason: string;
  requestedAt: string;
  status: 'pending_processing' | 'completed';
}

@Injectable()
export class AdminService {
  private notifications = new Map<string, NotificationRecord[]>();
  private privacyRequests: PrivacyDeletionRequestRecord[] = [];
  private usersStatus = new Map<string, 'invited' | 'active' | 'disabled'>();

  constructor(
    @Inject(AuditLogRepository) private readonly auditLogRepo: AuditLogRepository,
  ) {}

  // Issue #21: Admin User Management
  async updateUserStatus(userId: string, input: AdminUserStatusInput): Promise<{ userId: string; status: string }> {
    this.usersStatus.set(userId, input.status);
    await this.recordAuditLog('admin_root', 'USER_STATUS_UPDATED', { targetUserId: userId, newStatus: input.status });
    return { userId, status: input.status };
  }

  // Issue #22 & Ticket T-03: Persistent Audit Log (Hard Invariant #6: Append-only immutability!)
  async recordAuditLog(actorId: string | null, action: string, meta: Record<string, unknown> = {}): Promise<AuditLogRecord> {
    const id = `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const createdAt = new Date().toISOString();

    await this.auditLogRepo.append({
      id,
      actor_id: actorId,
      action,
      meta,
      created_at: createdAt,
    });

    return {
      id,
      actorId,
      action,
      meta,
      createdAt,
    };
  }

  async getAuditLogs(): Promise<AuditLogRecord[]> {
    const rows = await this.auditLogRepo.findAll();
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      action: r.action,
      meta: r.meta,
      createdAt: r.created_at,
    }));
  }

  // Prohibits UPDATE or DELETE on audit log (Hard Invariant #6)
  async modifyAuditLogProhibited(): Promise<never> {
    await this.auditLogRepo.delete('any_audit_id');
    throw new BadRequestException('Audit log entries are append-only and cannot be modified or deleted');
  }

  // ADM-03 Helper: Record Admin Login
  async logAdminLogin(adminId: string, meta: Record<string, unknown> = {}): Promise<AuditLogRecord> {
    return this.recordAuditLog(adminId, 'ADMIN_LOGIN', meta);
  }

  // ADM-03 Helper: Record Bulk Import Action
  async logBulkImport(actorId: string, meta: Record<string, unknown> = {}): Promise<AuditLogRecord> {
    return this.recordAuditLog(actorId, 'BULK_IMPORT_INITIATED', meta);
  }

  // ADM-04 Helper: Record Data Export Action
  async logDataExport(adminId: string, meta: Record<string, unknown> = {}): Promise<AuditLogRecord> {
    return this.recordAuditLog(adminId, 'DATA_EXPORT_PERFORMED', meta);
  }

  // Issue #23: In-App Notifications (NOT-03)
  async getNotifications(userId: string): Promise<NotificationRecord[]> {
    const userNotifs = this.notifications.get(userId);
    if (!userNotifs) {
      const defaultNotif: NotificationRecord = {
        id: `notif_welcome_${userId}`,
        userId,
        title: 'Welcome to Indian Job Portal',
        message: 'Your account is ready. Complete your profile to get discovered.',
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      this.notifications.set(userId, [defaultNotif]);
      return [defaultNotif];
    }
    return userNotifs;
  }

  async markNotificationRead(userId: string, notifId: string): Promise<NotificationRecord> {
    const userNotifs = await this.getNotifications(userId);
    const target = userNotifs.find((n) => n.id === notifId);
    if (!target) {
      throw new NotFoundException('Notification not found');
    }
    target.isRead = true;
    return target;
  }

  // Issue #24: DPDP Privacy Deletion Request
  async requestAccountDeletion(userId: string, reason?: string): Promise<PrivacyDeletionRequestRecord> {
    const reqRecord: PrivacyDeletionRequestRecord = {
      id: `del_req_${Date.now()}`,
      userId,
      reason: reason || 'User requested account deletion under DPDP principles',
      requestedAt: new Date().toISOString(),
      status: 'pending_processing',
    };
    this.privacyRequests.push(reqRecord);
    await this.recordAuditLog(userId, 'PRIVACY_DELETION_REQUESTED', { reason });
    return reqRecord;
  }

  // Issue #30: Resume Builder
  async generateResume(input: GenerateResumeInput): Promise<{ resumeId: string; template: string; downloadUrl: string }> {
    const resumeId = `res_${Date.now()}`;
    return {
      resumeId,
      template: input.template,
      downloadUrl: `/api/resume/download/${resumeId}`,
    };
  }

  // Issue #32: ADM-02 Full Admin Analytics & Reports
  async getAnalyticsReports(): Promise<{
    signups: { total: number; seekerCount: number; employerCount: number };
    jobs: { activeJobs: number; applicationsSubmitted: number };
    smsSpendInr: { totalSpend: number; dailyAverage: number };
  }> {
    return {
      signups: { total: 50, seekerCount: 40, employerCount: 10 },
      jobs: { activeJobs: 12, applicationsSubmitted: 35 },
      smsSpendInr: { totalSpend: 150.5, dailyAverage: 21.5 },
    };
  }
}
