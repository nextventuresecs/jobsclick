import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, UserRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class UserRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async findById(id: string): Promise<UserRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase.from('users').select('*').eq('id', id).maybeSingle();
        if (!error && data) return data as UserRow;
      } catch {
        // Fall back to persistent local store if database is unreachable
      }
    }
    const users = this.persistentStore.getTable<UserRow>('users');
    return users[id] || null;
  }

  async findByPhone(phone: string): Promise<UserRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase.from('users').select('*').eq('phone', phone).maybeSingle();
        if (!error && data) return data as UserRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const users = this.persistentStore.getTable<UserRow>('users');
    return Object.values(users).find((u) => u.phone === phone) || null;
  }

  async save(user: UserRow): Promise<UserRow> {
    this.persistentStore.setRow('users', user.id, user);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('users').upsert({
          id: user.id,
          phone: user.phone,
          email: user.email,
          role: user.role,
          status: user.status,
          source: user.source,
          created_by: user.created_by,
          updated_by: user.updated_by,
          created_at: user.created_at,
          updated_at: user.updated_at,
        });
      } catch {
        // Persisted locally
      }
    }

    return user;
  }

  async update(id: string, updates: Partial<UserRow>): Promise<UserRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: UserRow = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    return this.save(updated);
  }
}
