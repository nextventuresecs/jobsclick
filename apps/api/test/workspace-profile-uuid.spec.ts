import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { jobSeekerProfileSchema, institutionProfileSchema } from '@indian-job-portal/validation';
import { ProfilesService } from '../src/profiles/profiles.service.js';
import type { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import type { UserRepository } from '../src/database/repositories/user.repository.js';

describe('AUTH-05 workspace persistence with database UUID identifiers', () => {
  it('creates a seeker profile with a UUID rather than a user-derived identifier', async () => {
    const save = vi.fn();
    const profiles = { findSeekerProfileByUserId: async () => null, saveSeekerProfile: save } as unknown as ProfileRepository;
    const users = { findById: async () => ({ phone: '9876543210', email: null }) } as unknown as UserRepository;
    const service = new ProfilesService(profiles, users);
    const result = await service.updateSeekerProfileMe('12345678-1234-4234-8234-123456789012', jobSeekerProfileSchema.parse({ fullName: 'Candidate', city: 'Pune' }));
    expect(z.string().uuid().safeParse(result.id).success).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: result.id }));
  });
  it('creates an institution profile with a UUID rather than a user-derived identifier', async () => {
    const save = vi.fn();
    const profiles = { findInstitutionProfileByUserId: async () => null, saveInstitutionProfile: save } as unknown as ProfileRepository;
    const service = new ProfilesService(profiles, {} as UserRepository);
    const result = await service.updateInstitutionProfileMe('12345678-1234-4234-8234-123456789012', institutionProfileSchema.parse({ institutionName: 'Test Institution', affiliation: 'Test Board', contactPerson: 'Coordinator', address: 'Test Campus Address' }));
    expect(z.string().uuid().safeParse(result.id).success).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: result.id }));
  });
});
