import { Inject, Injectable, ServiceUnavailableException, NotFoundException, Optional } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, BusinessProfileRow, InstitutionProfileRow, JobRow } from '@indian-job-portal/database';
import { z } from 'zod';
import { publicDirectoryQuerySchema, type PublicDirectoryQuery, type JobFilterInput, publicInstitutionCmsSchema } from '@indian-job-portal/validation';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';
import { UserRepository } from './user.repository.js';

// Explicit projection lists: changes require the independent native snapshot review.
const columns = {
  "public_jobs": [
    "id",
    "employer_id",
    "title",
    "description",
    "category",
    "employment_type",
    "experience_level",
    "min_pay",
    "max_pay",
    "city",
    "district",
    "state",
    "openings",
    "skills",
    "expiry_date",
    "is_featured",
    "featured_until",
    "created_at"
  ],
  "public_business_profiles": [
    "id",
    "company_name",
    "ownership_type",
    "company_size",
    "sector",
    "city",
    "district",
    "state",
    "logo_url",
    "website",
    "year_of_registration",
    "commencement_year",
    "know_my_business",
    "products_brief",
    "services_brief",
    "is_msme",
    "is_dpiit_startup",
    "created_at"
  ],
  "public_institution_profiles": [
    "id",
    "institution_name",
    "institution_type",
    "affiliation",
    "establishment_year",
    "website",
    "city",
    "district",
    "state",
    "trades_offered",
    "annual_capacity",
    "placement_brochure_url",
    "about",
    "created_at"
  ]
} as const;
type Camel<S extends string> = S extends `${infer A}_${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
type PublicRecord<V extends keyof typeof columns> = { [K in keyof Database['public']['Views'][V]['Row'] & typeof columns[V][number] as Camel<K & string>]: Database['public']['Views'][V]['Row'][K] };
function project<V extends keyof typeof columns>(view: V, row: Record<string, unknown>): PublicRecord<V> {
  return Object.fromEntries(columns[view].map(key => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), row[key] ?? null])) as PublicRecord<V>;
}
function promoted(row: Record<string,unknown>): boolean { return row['is_featured'] === true && typeof row['featured_until'] === 'string' && Date.parse(row['featured_until']) > Date.now(); }
function uuid(id: string): void { if (!z.string().uuid().safeParse(id).success) throw new NotFoundException('PUBLIC_RESOURCE_NOT_FOUND'); }

@Injectable()
export class PublicDiscoveryRepository {
  private readonly store = PersistentDatabaseStore.getInstance();
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient<Database>,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Optional() @Inject('PUBLIC_DISCOVERY_TEST_MODE') private readonly testMode = process.env['NODE_ENV'] === 'test',
  ) {}
  private unavailable(): never { throw new ServiceUnavailableException('PUBLIC_DISCOVERY_UNAVAILABLE'); }
  private async eligible(owner: string, role: string): Promise<boolean> {
    const user = await this.users.findById(owner);
    return Boolean(user && user.role === role && user.status === 'active' && /^[6-9][0-9]{9}$/.test(user.phone ?? ''));
  }
  private async fixtureRows(view: keyof typeof columns): Promise<Record<string, unknown>[]> {
    if (view === 'public_jobs') {
      const companies = await this.fixtureRows('public_business_profiles');
      const published = Object.values(this.store.getTable<BusinessProfileRow>('business_profiles')).filter(p => companies.some(c => c['id'] === p.id));
      return Object.values(this.store.getTable<JobRow>('jobs')).filter(j => j.is_active && (!j.expiry_date || Date.parse(j.expiry_date) > Date.now()) && published.some(p => p.user_id === j.employer_id));
    }
    const business = view === 'public_business_profiles';
    const profiles = business ? Object.values(this.store.getTable<BusinessProfileRow>('business_profiles')) : Object.values(this.store.getTable<InstitutionProfileRow>('institution_profiles'));
    const eligible = await Promise.all(profiles.map(async p => p.is_published === true && z.string().uuid().safeParse(p.id).success && await this.eligible(p.user_id, business ? 'employer' : 'intermediary')));
    return profiles.filter((_, i) => eligible[i]);
  }
  private async one<V extends keyof typeof columns>(view: V, id: string): Promise<PublicRecord<V>> {
    uuid(id);
    if (this.testMode) {
      const row = (await this.fixtureRows(view)).find(r => r['id'] === id);
      if (!row) throw new NotFoundException('PUBLIC_RESOURCE_NOT_FOUND');
      return project(view, row);
    }
    const { data, error } = await this.db.from(view).select(columns[view].join(',')).filter('id', 'eq', id).maybeSingle();
    if (error) return this.unavailable();
    if (!data) throw new NotFoundException('PUBLIC_RESOURCE_NOT_FOUND');
    return project(view, data as unknown as Record<string, unknown>);
  }
  company(id: string) { return this.one('public_business_profiles', id); }
  institution(id: string) { return this.one('public_institution_profiles', id); }
  async job(id: string) { const row = await this.one('public_jobs', id); return { ...row, title: z.string().parse(row.title), isPromoted: Boolean(row.isFeatured && row.featuredUntil && Date.parse(row.featuredUntil) > Date.now()), isActive: true }; }
  async directory(kind: 'business' | 'institution', input: PublicDirectoryQuery) {
    const query = publicDirectoryQuerySchema.parse(input);
    const view = kind === 'business' ? 'public_business_profiles' : 'public_institution_profiles';
    const name = kind === 'business' ? 'company_name' : 'institution_name';
    if (this.testMode) {
      const rows = (await this.fixtureRows(view)).filter(r => (!query.query || String(r[name]).toLowerCase().includes(query.query.toLowerCase())) && (!query.sector || r['sector'] === query.sector) && (!query.type || r['institution_type'] === query.type));
      return rows.sort((a,b) => String(a['id']).localeCompare(String(b['id']))).slice(query.offset,query.offset+query.limit).map(row => project(view,row));
    }
    let request = this.db.from(view).select(columns[view].join(',')).order('id').range(query.offset, query.offset + query.limit - 1);
    if (query.query) request = request.ilike(name, '%' + query.query.replace(/[\\%_]/g, '\\$&') + '%');
    if (query.sector && kind === 'business') request = request.filter('sector', 'eq', query.sector);
    if (query.type && kind === 'institution') request = request.filter('institution_type', 'eq', query.type);
    const { data, error } = await request;
    if (error) return this.unavailable();
    return (data ?? []).map(row => project(view,row as unknown as Record<string,unknown>));
  }
  async jobs(filters: JobFilterInput) {
    if (filters.companyId) uuid(filters.companyId);
    if (this.testMode) {
      const company = filters.companyId ? this.store.getTable<BusinessProfileRow>('business_profiles')[filters.companyId] : null;
      const rows = (await this.fixtureRows('public_jobs')).filter(r => (!filters.companyId || r['employer_id'] === company?.user_id) && (!filters.keyword || [r['title'],r['description'],...(Array.isArray(r['skills']) ? r['skills'] : [])].some(text => String(text).toLowerCase().includes(filters.keyword!.toLowerCase()))) && (!filters.city || r['city'] === filters.city) && (!filters.category || r['category'] === filters.category) && (filters.minPay === undefined || Number(r['max_pay']) >= filters.minPay));
      return { jobs: rows.sort((a,b)=>Number(promoted(b))-Number(promoted(a)) || Date.parse(String(b['created_at']))-Date.parse(String(a['created_at'])) || String(a['id']).localeCompare(String(b['id']))).slice(filters.offset,filters.offset+filters.limit).map(row => ({...project('public_jobs',row),isPromoted:promoted(row),isActive:true})), total: rows.length };
    }
    const { data, error } = await this.db.rpc('search_public_jobs', { p_keyword:filters.keyword,p_city:filters.city,p_category:filters.category,p_min_pay:filters.minPay,p_company:filters.companyId,p_limit:Math.min(filters.limit,100),p_offset:Math.min(filters.offset,10000) });
    if (error) return this.unavailable();
    const result = z.object({ jobs:z.array(z.record(z.unknown())),total:z.number().int().nonnegative() }).safeParse(data);
    if (!result.success) return this.unavailable();
    return { jobs: result.data.jobs.map(row => ({...project('public_jobs',row),isPromoted:promoted(row),isActive:true})), total:result.data.total };
  }
  async cms(id: string) {
    uuid(id);
    let content: unknown;
    if (this.testMode) {
      await this.institution(id);
      content = this.store.getTable<InstitutionProfileRow>('institution_profiles')[id]?.cms_data ?? {};
    } else {
      const { data, error } = await this.db.rpc('read_public_institution_cms',{p_id:id});
      if (error) return this.unavailable();
      if (!data) throw new NotFoundException('PUBLIC_RESOURCE_NOT_FOUND');
      content = z.object({content:z.unknown()}).parse(data).content ?? {};
    }
    const result = publicInstitutionCmsSchema.safeParse(content);
    if (!result.success) return this.unavailable();
    return result.data;
  }
}
