import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  meta: Record<string, unknown>;
  created_at: string;
}

@Injectable()
export class AuditLogRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async append(record: AuditLogRow): Promise<AuditLogRow> {
    // 1. Always persist to resilient local state
    this.persistentStore.setRow('audit_logs', record.id, record);

    // 2. Persist to Supabase PostgreSQL table audit_logs
    if (!this.isTestMode) {
      try {
        await this.supabase.from('audit_logs').insert({
          id: record.id,
          actor_id: record.actor_id,
          action: record.action,
          meta: record.meta,
          created_at: record.created_at,
        } as any);
      } catch (err) {
        // Maintained in persistent store if remote DB unreachable
      }
    }

    return record;
  }

  async findAll(limit: number = 200): Promise<AuditLogRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data && data.length > 0) {
          return data as unknown as AuditLogRow[];
        }
      } catch {
        // Fall back to persistent local store
      }
    }

    const logs = this.persistentStore.getTable<AuditLogRow>('audit_logs');
    return Object.values(logs)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  // Hard Invariant #6: Prohibits UPDATE or DELETE on audit logs
  async update(_id: string, _updates: Partial<AuditLogRow>): Promise<never> {
    throw new BadRequestException('Audit log entries are immutable and cannot be updated or deleted');
  }

  async delete(_id: string): Promise<never> {
    throw new BadRequestException('Audit log entries are immutable and cannot be updated or deleted');
  }
}
