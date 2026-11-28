import { Injectable, Inject, Optional, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { isTestEnv } from '@indian-job-portal/validation';
import type { Database } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

export type PrivacyErasureRequestRow = Database['public']['Tables']['privacy_erasure_requests']['Row'];

const ACTIVE_STATUSES: PrivacyErasureRequestRow['status'][] = ['pending', 'processing', 'done'];

@Injectable()
export class PrivacyErasureRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode = isTestEnv();

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>,
    @Optional() isTestMode?: boolean,
  ) {
    if (isTestEnv() && typeof isTestMode === 'boolean') {
      this.isTestMode = isTestMode;
    }
  }

  /** Idempotent: returns the user's active request, creating one only if none exists. */
  async createOrGetActive(
    userId: string,
    reason: string | null,
  ): Promise<{ request: PrivacyErasureRequestRow; created: boolean }> {
    const existing = await this.findActive(userId);
    if (existing) return { request: existing, created: false };

    if (this.isTestMode) {
      const now = new Date().toISOString();
      const row: PrivacyErasureRequestRow = {
        id: randomUUID(),
        user_id: userId,
        status: 'pending',
        reason,
        error_code: null,
        requested_at: now,
        processed_at: null,
        updated_at: now,
      };
      this.persistentStore.setRow('privacy_erasure_requests', row.id, row);
      return { request: row, created: true };
    }

    const { data, error } = await this.supabase
      .from('privacy_erasure_requests')
      .insert({ user_id: userId, reason })
      .select('*')
      .single();

    if (error || !data) {
      // Concurrent request won the partial unique index; return that one.
      if (error?.code === '23505') {
        const winner = await this.findActive(userId);
        if (winner) return { request: winner, created: false };
      }
      throw new InternalServerErrorException({ code: 'DATABASE_ERROR' });
    }
    return { request: data, created: true };
  }

  private async findActive(userId: string): Promise<PrivacyErasureRequestRow | null> {
    if (this.isTestMode) {
      const rows = Object.values(this.persistentStore.getTable<PrivacyErasureRequestRow>('privacy_erasure_requests'));
      return rows.find((r) => r.user_id === userId && ACTIVE_STATUSES.includes(r.status)) ?? null;
    }

    const { data, error } = await this.supabase
      .from('privacy_erasure_requests')
      .select('*')
      .eq('user_id', userId)
      .in('status', ACTIVE_STATUSES)
      .maybeSingle();
    if (error) throw new InternalServerErrorException({ code: 'DATABASE_ERROR' });
    return data;
  }
}
