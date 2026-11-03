import {
  Injectable,
  Inject,
  InternalServerErrorException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, UserRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT } from '../supabase.provider.js';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface IUserRepository {
  findById(id: string): Promise<UserRow | null>;
  findByPhone(phone: string): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  findByPendingEmail(pendingEmail: string): Promise<UserRow | null>;
  create(user: {
    phone: string;
    role: UserRow['role'];
    status?: UserRow['status'];
    source?: string;
  }): Promise<UserRow>;
  setPendingEmail(id: string, pendingEmail: string): Promise<UserRow | null>;
  confirmEmail(id: string, email: string): Promise<UserRow | null>;
  updateStatus(
    id: string,
    newStatus: UserRow['status'],
    expectedCurrentStatus?: UserRow['status'],
  ): Promise<UserRow | null>;
  updateRole(
    id: string,
    newRole: UserRow['role'],
  ): Promise<UserRow | null>;
  touchLastLogin(id: string): Promise<void>;
  incrementTokenVersion(id: string): Promise<UserRow>;
  findAll(limit?: number): Promise<UserRow[]>;
}

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async findById(id: string): Promise<UserRow | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === '22P02') {
        return null;
      }
      throw new InternalServerErrorException('Database error: failed to lookup user by id');
    }
    return (data as UserRow) || null;
  }

  async findByPhone(phone: string): Promise<UserRow | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Database error: failed to lookup user by phone');
    }
    return (data as UserRow) || null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const normalized = email.trim().toLowerCase();
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .ilike('email', normalized)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Database error: failed to lookup user by email');
    }
    return (data as UserRow) || null;
  }

  async findByPendingEmail(pendingEmail: string): Promise<UserRow | null> {
    const normalized = pendingEmail.trim().toLowerCase();
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .ilike('pending_email', normalized)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Database error: failed to lookup user by pending_email');
    }
    return (data as UserRow) || null;
  }

  async create(user: {
    phone: string;
    role: UserRow['role'];
    status?: UserRow['status'];
    source?: string;
  }): Promise<UserRow> {
    if (!/^[6-9]\d{9}$/.test(user.phone)) {
      throw new BadRequestException('Invalid Indian phone number format');
    }

    const payload = {
      phone: user.phone,
      role: user.role,
      status: user.status || 'active',
      source: user.source || 'direct_web',
      token_version: 0,
    };

    const { data, error } = await this.supabase
      .from('users')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      // Handle Postgres unique violation only for users_phone_key (code 23505)
      const isPhoneConflict =
        error.code === '23505' &&
        (error.message?.includes('users_phone_key') || error.message?.includes('phone'));

      if (isPhoneConflict) {
        const existing = await this.findByPhone(user.phone);
        if (existing) {
          return existing;
        }
      }
      throw new InternalServerErrorException('Database error: failed to create user');
    }

    return data as UserRow;
  }

  async setPendingEmail(id: string, pendingEmail: string): Promise<UserRow | null> {
    const normalized = pendingEmail.trim().toLowerCase();

    // Check cross-column email uniqueness (email and pending_email across other users)
    const existingConfirmed = await this.findByEmail(normalized);
    if (existingConfirmed && existingConfirmed.id !== id) {
      throw new ConflictException('Email address is already in use or pending verification');
    }
    const existingPending = await this.findByPendingEmail(normalized);
    if (existingPending && existingPending.id !== id) {
      throw new ConflictException('Email address is already in use or pending verification');
    }

    const { data, error } = await this.supabase
      .from('users')
      .update({
        pending_email: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.code === '22P02') {
        return null;
      }
      if (error.code === '23505') {
        throw new ConflictException('Email address is already in use or pending verification');
      }
      throw new InternalServerErrorException('Database error: failed to set pending email');
    }

    return (data as UserRow) || null;
  }

  async confirmEmail(id: string, email: string): Promise<UserRow | null> {
    const normalized = email.trim().toLowerCase();
    const { data, error } = await this.supabase
      .from('users')
      .update({
        email: normalized,
        email_verified_at: new Date().toISOString(),
        pending_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('pending_email', normalized)
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.code === '22P02') {
        return null;
      }
      if (error.code === '23505') {
        throw new ConflictException('Email address is already in use');
      }
      throw new InternalServerErrorException('Database error: failed to confirm email');
    }

    return (data as UserRow) || null;
  }

  async updateRole(
    id: string,
    newRole: UserRow['role'],
  ): Promise<UserRow | null> {
    const { data, error } = await this.supabase
      .from('users')
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.code === '22P02') {
        return null;
      }
      throw new InternalServerErrorException('Database error: failed to update role');
    }

    return (data as UserRow) || null;
  }

  async updateStatus(
    id: string,
    newStatus: UserRow['status'],
    expectedCurrentStatus?: UserRow['status'],
  ): Promise<UserRow | null> {
    let query = this.supabase
      .from('users')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (expectedCurrentStatus !== undefined) {
      query = query.eq('status', expectedCurrentStatus);
    }

    const { data, error } = await query.select('*').maybeSingle();
    if (error) {
      if (error.code === '22P02') {
        return null;
      }
      throw new InternalServerErrorException('Database error: failed to update status');
    }

    return (data as UserRow) || null;
  }

  async touchLastLogin(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException('Database error: failed to update last login');
    }
  }

  async incrementTokenVersion(id: string): Promise<UserRow> {
    try {
      const rpcClient = this.supabase as unknown as {
        rpc: (name: string, params: Record<string, unknown>) => {
          single: () => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
      const { data, error } = await rpcClient
        .rpc('increment_token_version', { p_user_id: id })
        .single();

      if (!error && data) {
        return data as UserRow;
      }
    } catch {
      // Fallback below
    }

    // Direct fallback if RPC is unavailable
    const existing = await this.findById(id);
    if (!existing) {
      throw new InternalServerErrorException(`User not found: ${id}`);
    }
    const nextVersion = (existing.token_version ?? 0) + 1;
    const { data, error } = await this.supabase
      .from('users')
      .update({
        token_version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(`Failed to increment token_version for ${id}`);
    }
    return data as UserRow;
  }

  async findAll(limit = 1000): Promise<UserRow[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException('Database error: failed to fetch users');
    }
    return (data as UserRow[]) || [];
  }

  // Compatibility helper for tests that call save() with full UserRow
  async save(user: UserRow): Promise<UserRow> {
    const { data, error } = await this.supabase
      .from('users')
      .upsert(user)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(`Database error: failed to save user: ${error.message} (${error.code || ''})`);
    }
    return data as UserRow;
  }
}
