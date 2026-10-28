import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, UserRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class UserRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] !== 'production' &&
    (process.env['NODE_ENV'] === 'test' ||
      !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
      process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key');

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async findById(id: string): Promise<UserRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase.from('users').select('*').eq('id', id).maybeSingle();
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as UserRow) || null;
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const users = this.persistentStore.getTable<UserRow>('users');
    return users[id] || null;
  }

  async findByPhone(phone: string): Promise<UserRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase.from('users').select('*').eq('phone', phone).maybeSingle();
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as UserRow) || null;
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const users = this.persistentStore.getTable<UserRow>('users');
    return Object.values(users).find((u) => u.phone === phone) || null;
  }

  async save(user: UserRow): Promise<UserRow> {
    if (this.isTestMode) {
      this.persistentStore.setRow('users', user.id, user);
      return user;
    }

    const { error } = await this.supabase.from('users').upsert({
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

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
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

  async findAll(limit = 1000): Promise<UserRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as UserRow[]) || [];
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const users = this.persistentStore.getTable<UserRow>('users');
    return Object.values(users).slice(0, limit);
  }
}
