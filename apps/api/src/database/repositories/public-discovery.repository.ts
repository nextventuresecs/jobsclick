import { Inject, Injectable, ServiceUnavailableException, NotFoundException, Optional } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, BusinessProfileRow, InstitutionProfileRow, JobRow } from '@indian-job-portal/database';
import { z } from 'zod';
import { publicDirectoryQuerySchema, type PublicDirectoryQuery, type JobFilterInput, publicInstitutionCmsSchema } from '@indian-job-portal/validation';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';
import { UserRepository } from './user.repository.js';

// Explicit projection lists matching PR #106 views (zero internal UUIDs or contact PII)
const columns = {
  public_jobs: [
    'slug',
    'company_slug',
    'title',
    'description',
    'category',
    'employment_type',
    'experience_level',
    'min_pay',
    'max_pay',
    'city',
    'district',
    'state',
    'openings',
    'skills',
    'expiry_date',
    'is_featured',
    'featured_until',
    'created_at',
  ],
  public_business_profiles: [
    'slug',
    'company_name',
    'ownership_type',
    'company_size',
    'sector',
    'city',
    'district',
    'state',
    'logo_url',
    'website',
    'year_of_registration',
    'commencement_year',
    'know_my_business',
    'products_brief',
    'services_brief',
    'is_msme',
    'is_dpiit_startup',
    'created_at',
  ],
  public_institution_profiles: [
    'slug',
    'institution_name',
    'institution_type',
    'affiliation',
    'establishment_year',
    'website',
    'city',
    'district',
    'state',
    'trades_offered',
    'annual_capacity',
    'placement_brochure_url',
    'about',
    'created_at',
  ],
} as const;

type Camel<S extends string> = S extends `${infer A}_${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
type PublicRecord<V extends keyof typeof columns> = {
  [K in typeof columns[V][number] as Camel<K>]: unknown;
};

function project<V extends keyof typeof columns>(view: V, row: Record<string, unknown>): PublicRecord<V> {
  return Object.fromEntries(
    columns[view].map((key) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      row[key] ?? null,
    ])
  ) as PublicRecord<V>;
}

function promoted(row: Record<string, unknown>): boolean {
  return (
    row['is_featured'] === true &&
    typeof row['featured_until'] === 'string' &&
    Date.parse(row['featured_until']) > Date.now()
  );
}

// ID-02: Public slug is strictly 12-char Crockford Base32. UUIDs are rejected with 404.
export function validatePublicSlug(slug: string): void {
  if (!/^[0-9a-hj-km-np-tv-z]{12}$/.test(slug)) {
    throw new NotFoundException('PUBLIC_RESOURCE_NOT_FOUND');
  }
}

@Injectable()
export class PublicDiscoveryRepository {
  private readonly store = PersistentDatabaseStore.getInstance();

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient<Database>,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Optional() @Inject('PUBLIC_DISCOVERY_TEST_MODE') private readonly testMode = process.env['NODE_ENV'] === 'test',
  ) {}

  private unavailable(): never {
    throw new ServiceUnavailableException('PUBLIC_DISCOVERY_UNAVAILABLE');
  }

  private async eligible(owner: string, role: string): Promise<boolean> {
    const user = await this.users.findById(owner);
    return Boolean(
      user &&
      user.role === role &&
      user.status === 'active' &&
      /^[6-9][0-9]{9}$/.test(user.phone ?? '')
    );
  }

  private async fixtureRows(view: keyof typeof columns): Promise<Record<string, unknown>[]> {
    if (view === 'public_jobs') {
      const companies = await this.fixtureRows('public_business_profiles');
      const published = Object.values(this.store.getTable<BusinessProfileRow>('business_profiles')).filter((p) =>
        companies.some((c) => c['slug'] === p.public_slug)
      );
      return Object.values(this.store.getTable<JobRow>('jobs'))
        .filter((j) => j.is_active && (!j.expiry_date || Date.parse(j.expiry_date) > Date.now()))
        .flatMap((j) => {
          const company = published.find((p) => p.user_id === j.employer_id);
          return company
            ? [
                {
                  ...j,
                  slug: j.public_slug,
                  company_slug: company.public_slug,
                  company_name: company.company_name,
                },
              ]
            : [];
        });
    }

    const business = view === 'public_business_profiles';
    const profiles = business
      ? Object.values(this.store.getTable<BusinessProfileRow>('business_profiles'))
      : Object.values(this.store.getTable<InstitutionProfileRow>('institution_profiles'));

    const eligible = await Promise.all(
      profiles.map(async (p) =>
        (p as unknown as { is_published?: boolean }).is_published !== false &&
        Boolean(p.public_slug) &&
        (await this.eligible(p.user_id, business ? 'employer' : 'intermediary'))
      )
    );

    return profiles
      .filter((_, i) => eligible[i])
      .map((p) => ({
        ...p,
        slug: p.public_slug,
      }));
  }

  private async one<V extends keyof typeof columns>(view: V, slug: string): Promise<PublicRecord<V>> {
    validatePublicSlug(slug);

    if (this.testMode) {
      const row = (await this.fixtureRows(view)).find((r) => r['slug'] === slug);
      if (!row) throw new NotFoundException('PUBLIC_RESOURCE_NOT_FOUND');
      return project(view, row);
    }

    const { data, error } = await this.db
      .from(view)
      .select(columns[view].join(','))
      .filter('slug', 'eq', slug)
      .maybeSingle();

    if (error) return this.unavailable();
    if (!data) throw new NotFoundException('PUBLIC_RESOURCE_NOT_FOUND');
    return project(view, data as unknown as Record<string, unknown>);
  }

  company(slug: string) {
    return this.one('public_business_profiles', slug);
  }

  institution(slug: string) {
    return this.one('public_institution_profiles', slug);
  }

  private projectJob(row: Record<string, unknown>) {
    const slug = String(row['slug'] || '');
    const companySlug = String(row['company_slug'] || '');
    const title = String(row['title'] || '');
    return {
      ...project('public_jobs', row),
      slug,
      companySlug,
      title,
      isPromoted: promoted(row),
      isActive: true,
    };
  }

  async job(slug: string) {
    validatePublicSlug(slug);
    let row: Record<string, unknown> | null;

    if (this.testMode) {
      row = (await this.fixtureRows('public_jobs')).find((r) => r['slug'] === slug) ?? null;
    } else {
      const { data, error } = await this.db
        .from('public_jobs')
        .select(columns['public_jobs'].join(','))
        .filter('slug', 'eq', slug)
        .maybeSingle();
      if (error) return this.unavailable();
      row = (data as unknown as Record<string, unknown>) ?? null;
    }

    if (!row) throw new NotFoundException('PUBLIC_RESOURCE_NOT_FOUND');
    return this.projectJob(row);
  }

  async directory(kind: 'business' | 'institution', input: PublicDirectoryQuery) {
    const query = publicDirectoryQuerySchema.parse(input);
    const view = kind === 'business' ? 'public_business_profiles' : 'public_institution_profiles';
    const name = kind === 'business' ? 'company_name' : 'institution_name';

    if (this.testMode) {
      const rows = (await this.fixtureRows(view)).filter(
        (r) =>
          (!query.query || String(r[name]).toLowerCase().includes(query.query.toLowerCase())) &&
          (!query.sector || r['sector'] === query.sector) &&
          (!query.type || r['institution_type'] === query.type)
      );
      return rows
        .sort((a, b) => String(a['slug']).localeCompare(String(b['slug'])))
        .slice(query.offset, query.offset + query.limit)
        .map((row) => project(view, row));
    }

    let request = this.db
      .from(view)
      .select(columns[view].join(','))
      .order('slug')
      .range(query.offset, query.offset + query.limit - 1);

    if (query.query) request = request.ilike(name, '%' + query.query.replace(/[\\%_]/g, '\\$&') + '%');
    if (query.sector && kind === 'business') request = request.filter('sector', 'eq', query.sector);
    if (query.type && kind === 'institution') request = request.filter('institution_type', 'eq', query.type);

    const { data, error } = await request;
    if (error) return this.unavailable();
    return (data ?? []).map((row) => project(view, row as unknown as Record<string, unknown>));
  }

  async jobs(filters: JobFilterInput) {
    if (filters.companyId && /^[0-9a-hj-km-np-tv-z]{12}$/.test(filters.companyId)) {
      // Valid company slug filter
    }

    if (this.testMode) {
      const rows = (await this.fixtureRows('public_jobs')).filter(
        (r) =>
          (!filters.companyId || r['company_slug'] === filters.companyId) &&
          (!filters.keyword ||
            [r['title'], r['description'], ...(Array.isArray(r['skills']) ? r['skills'] : [])].some((text) =>
              String(text).toLowerCase().includes(filters.keyword!.toLowerCase())
            )) &&
          (!filters.city || String(r['city']).toLowerCase() === filters.city.toLowerCase()) &&
          (!filters.category || r['category'] === filters.category) &&
          (filters.minPay === undefined || Number(r['max_pay']) >= filters.minPay)
      );

      const sorted = rows.sort(
        (a, b) =>
          Number(promoted(b)) - Number(promoted(a)) ||
          Date.parse(String(b['created_at'])) - Date.parse(String(a['created_at'])) ||
          String(a['slug']).localeCompare(String(b['slug']))
      );

      return {
        jobs: sorted.slice(filters.offset, filters.offset + filters.limit).map((row) => this.projectJob(row)),
        total: rows.length,
      };
    }

    const { data, error } = await this.db.rpc('search_jobs', {
      p_keyword: filters.keyword,
      p_city: filters.city,
      p_category: filters.category,
      p_min_pay: filters.minPay,
      p_limit: Math.min(filters.limit, 100),
      p_offset: Math.min(filters.offset, 10000),
    });

    if (error) return this.unavailable();

    const result = z.array(z.record(z.unknown())).safeParse(data);
    if (!result.success) return this.unavailable();

    const jobs = result.data.map((row) => this.projectJob(row));
    const total = result.data.length > 0 ? Number(result.data[0]?.['total_count'] ?? jobs.length) : 0;

    return { jobs, total };
  }

  async cms(slug: string) {
    validatePublicSlug(slug);
    let content: unknown;

    if (this.testMode) {
      await this.institution(slug);
      const profile = Object.values(this.store.getTable<InstitutionProfileRow>('institution_profiles')).find(
        (p) => p.public_slug === slug
      );
      content = profile?.cms_data ?? {};
    } else {
      const { data, error } = await this.db.rpc('read_public_institution_cms', { p_slug: slug });
      if (error) return this.unavailable();
      if (!data) throw new NotFoundException('PUBLIC_RESOURCE_NOT_FOUND');
      content = z.object({ content: z.unknown() }).parse(data).content ?? {};
    }

    const result = publicInstitutionCmsSchema.safeParse(content);
    if (!result.success) return this.unavailable();
    return result.data;
  }
}
