import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { UserRow, CreditLedgerRow } from '@indian-job-portal/database';
import { PersistentDatabaseStore } from '../supabase.provider.js';
import type { IUserRepository } from './user.repository.js';
import crypto from 'node:crypto';

@Injectable()
export class InMemoryUserRepository implements IUserRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();

  async findById(id: string): Promise<UserRow | null> {
    const users = this.persistentStore.getTable<UserRow>('users');
    return users[id] || null;
  }

  async findByPhone(phone: string): Promise<UserRow | null> {
    const users = this.persistentStore.getTable<UserRow>('users');
    return Object.values(users).find((u) => u.phone === phone) || null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const normalized = email.trim().toLowerCase();
    const users = this.persistentStore.getTable<UserRow>('users');
    return Object.values(users).find((u) => u.email?.toLowerCase() === normalized) || null;
  }

  async findByPendingEmail(pendingEmail: string): Promise<UserRow | null> {
    const normalized = pendingEmail.trim().toLowerCase();
    const users = this.persistentStore.getTable<UserRow>('users');
    return (
      Object.values(users).find((u) => (u as Record<string, unknown>)['pending_email']?.toString().toLowerCase() === normalized) ||
      null
    );
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

    const existing = await this.findByPhone(user.phone);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const newUser: UserRow = {
      id,
      phone: user.phone,
      email: null,
      role: user.role,
      status: user.status || 'active',
      source: user.source || 'direct_web',
      token_version: 0,
      created_by: null,
      updated_by: null,
      created_at: now,
      updated_at: now,
    };
    (newUser as Record<string, unknown>)['pending_email'] = null;
    (newUser as Record<string, unknown>)['email_verified_at'] = null;

    this.persistentStore.setRow('users', newUser.id, newUser);

    // Replicate PostgreSQL trigger behavior: Auto-grant starter credits for active job_seekers
    if (newUser.role === 'job_seeker' && newUser.status === 'active') {
      this.grantStarterCreditsInMemory(newUser.id);
    }

    return newUser;
  }

  async setPendingEmail(id: string, pendingEmail: string): Promise<UserRow | null> {
    const normalized = pendingEmail.trim().toLowerCase();
    const users = this.persistentStore.getTable<UserRow>('users');

    // Check collision across users
    for (const u of Object.values(users)) {
      if (u.id !== id) {
        if (u.email?.toLowerCase() === normalized) {
          throw new ConflictException('Email address is already in use or pending verification');
        }
        const pending = (u as Record<string, unknown>)['pending_email']?.toString().toLowerCase();
        if (pending === normalized) {
          throw new ConflictException('Email address is already in use or pending verification');
        }
      }
    }

    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: UserRow = {
      ...existing,
      updated_at: new Date().toISOString(),
    };
    (updated as Record<string, unknown>)['pending_email'] = normalized;

    this.persistentStore.setRow('users', id, updated);
    return updated;
  }

  async confirmEmail(id: string, email: string): Promise<UserRow | null> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.findById(id);
    if (!existing) return null;

    const currentPending = (existing as Record<string, unknown>)['pending_email']?.toString().toLowerCase();
    if (currentPending !== normalized) {
      return null;
    }

    // Check duplicate email
    const users = this.persistentStore.getTable<UserRow>('users');
    for (const u of Object.values(users)) {
      if (u.id !== id && u.email?.toLowerCase() === normalized) {
        throw new ConflictException('Email address is already in use');
      }
    }

    const now = new Date().toISOString();
    const updated: UserRow = {
      ...existing,
      email: normalized,
      updated_at: now,
    };
    (updated as Record<string, unknown>)['pending_email'] = null;
    (updated as Record<string, unknown>)['email_verified_at'] = now;

    this.persistentStore.setRow('users', id, updated);
    return updated;
  }

  async updateRole(
    id: string,
    newRole: UserRow['role'],
  ): Promise<UserRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: UserRow = {
      ...existing,
      role: newRole,
      token_version: (existing.token_version ?? 0) + 1,
      updated_at: now,
    };

    this.persistentStore.setRow('users', id, updated);
    return updated;
  }

  async updateStatus(
    id: string,
    newStatus: UserRow['status'],
    expectedCurrentStatus?: UserRow['status'],
  ): Promise<UserRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    if (expectedCurrentStatus !== undefined && existing.status !== expectedCurrentStatus) {
      return null;
    }

    const wasInvited = existing.status === 'invited';
    const now = new Date().toISOString();
    const updated: UserRow = {
      ...existing,
      status: newStatus,
      updated_at: now,
    };

    this.persistentStore.setRow('users', id, updated);

    // Replicate PostgreSQL trigger behavior: invited -> active grants starter credits
    if (wasInvited && newStatus === 'active' && updated.role === 'job_seeker') {
      this.grantStarterCreditsInMemory(id);
    }

    return updated;
  }

  async touchLastLogin(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing) {
      this.persistentStore.setRow('users', id, {
        ...existing,
        updated_at: new Date().toISOString(),
      });
    }
  }

  async incrementTokenVersion(id: string): Promise<UserRow> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new InternalServerErrorException(`User not found: ${id}`);
    }
    const nextVersion = (existing.token_version ?? 0) + 1;
    const updated: UserRow = {
      ...existing,
      token_version: nextVersion,
      updated_at: new Date().toISOString(),
    };
    this.persistentStore.setRow('users', id, updated);
    return updated;
  }

  async findAll(limit = 1000): Promise<UserRow[]> {
    const users = this.persistentStore.getTable<UserRow>('users');
    return Object.values(users).slice(0, limit);
  }

  async save(user: UserRow): Promise<UserRow> {
    this.persistentStore.setRow('users', user.id, user);
    return user;
  }

  private grantStarterCreditsInMemory(userId: string): void {
    const ledgers = this.persistentStore.getTable<CreditLedgerRow>('credit_ledgers');
    const alreadyGranted = Object.values(ledgers).some(
      (l) => l.user_id === userId && l.reason === 'starter',
    );
    if (!alreadyGranted) {
      const ledgerId = crypto.randomUUID();
      const row: CreditLedgerRow = {
        id: ledgerId,
        user_id: userId,
        amount: 10,
        reason: 'starter',
        actor_id: userId,
        created_at: new Date().toISOString(),
      };
      this.persistentStore.setRow('credit_ledgers', ledgerId, row);
    }
  }
}
