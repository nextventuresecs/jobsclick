import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { UserRepository, type IUserRepository } from '../src/database/repositories/user.repository.js';
import { InMemoryUserRepository } from '../src/database/repositories/in-memory-user.repository.js';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { isStrictEnv } from '../src/config/env.js';

const SUPABASE_LOCAL_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('UserRepository & InMemoryUserRepository Contract Tests (Token USER_REPOSITORY)', () => {
  const implementations: Array<{
    name: string;
    factory: () => IUserRepository;
  }> = [
    {
      name: 'InMemoryUserRepository (Mock Store)',
      factory: () => new InMemoryUserRepository(),
    },
    {
      name: 'UserRepository (Real Local Supabase)',
      factory: () => {
        const client = createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        });
        return new UserRepository(client);
      },
    },
  ];

  implementations.forEach(({ name, factory }) => {
    describe(`Implementation Contract: ${name}`, () => {
      let repo: IUserRepository;
      let counter = 100;

      const nextPhone = (): string => {
        counter++;
        return `98765${String(Date.now()).slice(-4)}${String(counter).slice(-1)}`;
      };

      beforeEach(() => {
        repo = factory();
      });

      it('rejects invalid phone numbers failing Indian regex', async () => {
        await expect(
          repo.create({
            phone: '12345',
            role: 'job_seeker',
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          repo.create({
            phone: '5876543210', // Must start with 6-9
            role: 'job_seeker',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('creates user with DB defaults, token_version=0, and handles duplicate phone idempotently', async () => {
        const phone = nextPhone();
        const user1 = await repo.create({
          phone,
          role: 'job_seeker',
        });

        expect(user1).toBeDefined();
        expect(user1.id).toBeDefined();
        expect(user1.phone).toBe(phone);
        expect(user1.role).toBe('job_seeker');
        expect(user1.status).toBe('active');
        expect(user1.token_version).toBe(0);

        // Calling create() with same phone should NOT throw; returns the same user row
        const user2 = await repo.create({
          phone,
          role: 'job_seeker',
        });

        expect(user2.id).toBe(user1.id);
        expect(user2.phone).toBe(phone);
      });

      it('manages secondary email flow: setPendingEmail -> confirmEmail with conditional safety', async () => {
        const phone = nextPhone();
        const user = await repo.create({
          phone,
          role: 'job_seeker',
        });

        const targetEmail = `candidate_${Date.now()}_${counter}@example.com`;

        // 1. setPendingEmail writes pending_email, leaves email null
        const pendingUser = await repo.setPendingEmail(user.id, targetEmail);
        expect(pendingUser).toBeDefined();
        expect((pendingUser as Record<string, unknown>)['pending_email']).toBe(targetEmail.toLowerCase());
        expect(pendingUser?.email).toBeNull();

        // 2. confirmEmail with mismatched email returns null
        const mismatched = await repo.confirmEmail(user.id, 'other@example.com');
        expect(mismatched).toBeNull();

        // 3. confirmEmail with correct pending email sets email, email_verified_at, clears pending_email
        const confirmed = await repo.confirmEmail(user.id, targetEmail);
        expect(confirmed).toBeDefined();
        expect(confirmed?.email).toBe(targetEmail.toLowerCase());
        expect((confirmed as Record<string, unknown>)['pending_email']).toBeNull();
        expect((confirmed as Record<string, unknown>)['email_verified_at']).toBeDefined();
      });

      it('enforces email uniqueness on setPendingEmail across existing users', async () => {
        const phone1 = nextPhone();
        const phone2 = nextPhone();
        const user1 = await repo.create({ phone: phone1, role: 'job_seeker' });
        const user2 = await repo.create({ phone: phone2, role: 'job_seeker' });

        const sharedEmail = `shared_${Date.now()}@example.com`;
        await repo.setPendingEmail(user1.id, sharedEmail);
        await repo.confirmEmail(user1.id, sharedEmail);

        // User 2 trying to add user 1's confirmed email should throw ConflictException (409)
        await expect(repo.setPendingEmail(user2.id, sharedEmail)).rejects.toThrow(ConflictException);
      });

      it('conditionally updates status only when expectedCurrentStatus matches', async () => {
        const phone = nextPhone();
        const user = await repo.create({ phone, role: 'job_seeker', status: 'invited' });

        // Conditional update matching 'invited' -> succeeds
        const activated = await repo.updateStatus(user.id, 'active', 'invited');
        expect(activated).toBeDefined();
        expect(activated?.status).toBe('active');

        // Conditional update expecting 'invited' when user is now 'active' -> returns null
        const failedCondition = await repo.updateStatus(user.id, 'disabled', 'invited');
        expect(failedCondition).toBeNull();

        // Re-read user to verify status was unaffected
        const current = await repo.findById(user.id);
        expect(current?.status).toBe('active');
      });

      it('atomically increments token_version', async () => {
        const phone = nextPhone();
        const user = await repo.create({ phone, role: 'job_seeker' });
        expect(user.token_version).toBe(0);

        const v1 = await repo.incrementTokenVersion(user.id);
        expect(v1.token_version).toBe(1);

        const v2 = await repo.incrementTokenVersion(user.id);
        expect(v2.token_version).toBe(2);
      });
    });
  });

  describe('Provider Selection using isStrictEnv() helper', () => {
    it('prohibits InMemoryUserRepository when environment is strict', () => {
      expect(isStrictEnv('production')).toBe(true);
      expect(isStrictEnv('staging')).toBe(true);
      expect(isStrictEnv('')).toBe(true);
      expect(isStrictEnv('custom-prod')).toBe(true);

      expect(isStrictEnv('development')).toBe(false);
      expect(isStrictEnv('test')).toBe(false);
    });
  });
});
