import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, BusinessProfileRow, JobRow, ApplicationRow } from '@indian-job-portal/database';
import { DistrictReportItem } from '@indian-job-portal/validation';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../database/supabase.provider.js';

@Injectable()
export class ReportsService {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  /**
   * Retrieves aggregated district-level employment indicators.
   * Hard Invariant #1 & PRD Decision D12: Exposes STRICTLY aggregated metrics with zero applicant/job-seeker PII.
   */
  async getDistrictEmploymentReports(actor?: { id: string; role: string }): Promise<DistrictReportItem[]> {
    if (actor && actor.role !== 'admin' && actor.role !== 'msme_admin') {
      throw new ForbiddenException('Forbidden: Insufficient permissions for District Employment Reports');
    }

    if (!this.isTestMode) {
      try {
        const client = this.supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> };
        const { data, error } = await client.rpc('get_district_employment_reports');
        if (!error && Array.isArray(data)) {
          return data.map((row) => ({
            district: String(row.district),
            onboardedMsmes: Number(row.onboarded_msmes || 0),
            activeJobs: Number(row.active_jobs || 0),
            totalHires: Number(row.total_hires || 0),
          }));
        }
      } catch {
        // Fall back to local persistent store calculation
      }
    }

    // Local / Test In-Memory Aggregation Engine
    const businessMap = this.persistentStore.getTable<BusinessProfileRow>('business_profiles');
    const jobsMap = this.persistentStore.getTable<JobRow>('jobs');
    const appsMap = this.persistentStore.getTable<ApplicationRow>('applications');

    const businesses = Object.values(businessMap);
    const jobs = Object.values(jobsMap);
    const applications = Object.values(appsMap);

    // Collect all unique normalized districts
    const districtSet = new Set<string>();
    businesses.forEach((b) => {
      if (b.district && b.district.trim()) districtSet.add(b.district.trim());
    });
    jobs.forEach((j) => {
      if (j.district && j.district.trim()) districtSet.add(j.district.trim());
    });

    if (districtSet.size === 0) {
      // Default baseline districts for demonstration / initial seeding
      ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain'].forEach((d) => districtSet.add(d));
    }

    const jobDistrictMap = new Map<string, string>();
    jobs.forEach((j) => {
      if (j.id && j.district) {
        jobDistrictMap.set(j.id, j.district.trim().toLowerCase());
      }
    });

    const report: DistrictReportItem[] = Array.from(districtSet).map((districtName) => {
      const lower = districtName.toLowerCase();

      const onboardedMsmes = businesses.filter(
        (b) => b.district && b.district.trim().toLowerCase() === lower,
      ).length;

      const activeJobs = jobs.filter(
        (j) => j.is_active !== false && j.district && j.district.trim().toLowerCase() === lower,
      ).length;

      const totalHires = applications.filter((app) => {
        if (app.status !== 'hired') return false;
        const jobDistrict = jobDistrictMap.get(app.job_id);
        return jobDistrict === lower;
      }).length;

      return {
        district: districtName,
        onboardedMsmes,
        activeJobs,
        totalHires,
      };
    });

    return report.sort((a, b) => a.district.localeCompare(b.district));
  }
}
