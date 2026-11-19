import { describe, it, expect, beforeEach } from 'vitest';
import { PublicDiscoveryRepository } from '../src/database/repositories/public-discovery.repository.js';
import { PersistentDatabaseStore } from '../src/database/supabase.provider.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { NotFoundException } from '@nestjs/common';

describe('PublicDiscoveryRepository - Opaque Slugs & Projections', () => {
  let repo: PublicDiscoveryRepository;
  const store = PersistentDatabaseStore.getInstance();

  beforeEach(() => {
    store.clearTable('business_profiles');
    store.clearTable('jobs');
    store.clearTable('institution_profiles');
    const mockUserRepo = {
      findById: async (id: string) => ({
        id,
        role: 'employer',
        status: 'active',
        phone: '9876543210',
      }),
    } as unknown as UserRepository;

    repo = new PublicDiscoveryRepository({} as any, mockUserRepo, true);
  });

  it('rejects UUID lookups on public routes with NotFoundException (ID-02)', async () => {
    const rawUuid = '123e4567-e89b-12d3-a456-426614174000';
    await expect(repo.company(rawUuid)).rejects.toThrow(NotFoundException);
    await expect(repo.job(rawUuid)).rejects.toThrow(NotFoundException);
    await expect(repo.institution(rawUuid)).rejects.toThrow(NotFoundException);
  });

  it('resolves valid 12-char Crockford Base32 public slug without leaking UUIDs', async () => {
    const validSlug = '3m8x0b7k9w2a';
    store.setRow('business_profiles', 'biz-internal-uuid-1', {
      id: 'biz-internal-uuid-1',
      user_id: 'usr-1',
      public_slug: validSlug,
      company_name: 'Apex Manufacturing',
      ownership_type: 'Private Limited',
      company_size: 'Small',
      sector: 'Automobile',
      city: 'Indore',
      district: 'Indore',
      is_published: true,
    } as any);

    const result = await repo.company(validSlug);
    expect(result.slug).toBe(validSlug);
    expect(result.companyName).toBe('Apex Manufacturing');
    expect((result as any).id).toBeUndefined();
    expect((result as any).userId).toBeUndefined();
  });
});
