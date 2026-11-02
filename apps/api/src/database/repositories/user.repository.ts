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
      token_version: user.token_version ?? 0,
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

  async create(user: {
    id?: string;
    phone: string;
    role: UserRow['role'];
    status?: UserRow['status'];
    source?: string;
    email?: string | null;
    token_version?: number;
  }): Promise<UserRow> {
    const now = new Date().toISOString();
    const newUser: UserRow = {
      id: user.id || crypto.randomUUID(),
      phone: user.phone,
      email: user.email ?? null,
      role: user.role,
      status: user.status || 'active',
      source: user.source || 'direct_web',
      token_version: user.token_version ?? 0,
      created_by: null,
      updated_by: null,
      created_at: now,
      updated_at: now,
    };
    return this.save(newUser);
  }

  async incrementTokenVersion(id: string): Promise<UserRow> {
    if (!this.isTestMode) {
      try {
        const rpcClient = this.supabase as unknown as {
          rpc: (name: string, params: Record<string, unknown>) => {
            maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
          };
        };
        const { data, error } = await rpcClient
          .rpc('increment_token_version', { p_user_id: id })
          .maybeSingle();

        if (!error && data) {
          return data as UserRow;
        }
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }

    const existing = await this.findById(id);
    if (!existing) {
      throw new InternalServerErrorException(`User not found: ${id}`);
    }
    const nextVersion = (existing.token_version ?? 0) + 1;
    const updated = await this.update(id, { token_version: nextVersion });
    if (!updated) {
      throw new InternalServerErrorException(`Failed to increment token_version for ${id}`);
    }
    return updated;
  }

  async updateStatus(id: string, status: UserRow['status']): Promise<UserRow> {
    const updated = await this.update(id, { status });
    if (!updated) {
      throw new InternalServerErrorException(`Failed to update status for user ${id}`);
    }
    return updated;
  }

  async updatePendingEmail(id: string, email: string): Promise<UserRow> {
    const updated = await this.update(id, { email });
    if (!updated) {
      throw new InternalServerErrorException(`Failed to update email for user ${id}`);
    }
    return updated;
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
