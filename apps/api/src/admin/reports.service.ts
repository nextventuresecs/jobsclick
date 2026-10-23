import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, BusinessProfileRow, JobRow, ApplicationRow } from '@indian-job-portal/database';
import { DistrictReportItem } from '@indian-job-portal/validation';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../database/supabase.provider.js';

/**
 * Statistical Disclosure Control (SDC):
 * Primary and complementary cell suppression to prevent candidate deanonymization
 * under PRD Invariant #1, Invariant #12, and DPDP Act 2023.
 */
export function applyStatisticalDisclosureControl(items: DistrictReportItem[]): DistrictReportItem[] {
  const K_ANONYMITY_THRESHOLD = 5;

  // 1. Identify primary suppressions for totalHires
  const primarySuppressedIndices = new Set<number>();
  items.forEach((item, index) => {
    if (item.totalHires > 0 && item.totalHires < K_ANONYMITY_THRESHOLD) {
      primarySuppressedIndices.add(index);
    }
  });

  // 2. Complementary (Secondary) suppression:
  // If exactly 1 cell is suppressed in the column, marginal total subtraction allows exact deduction.
  // Suppress a secondary cell (the smallest unsuppressed non-zero cell).
  const finalSuppressedIndices = new Set<number>(primarySuppressedIndices);
  if (primarySuppressedIndices.size === 1) {
    let minIndex = -1;
    let minVal = Infinity;
    items.forEach((item, index) => {
      if (!primarySuppressedIndices.has(index) && item.totalHires > 0) {
        if (item.totalHires < minVal) {
          minVal = item.totalHires;
          minIndex = index;
        }
      }
    });
    if (minIndex !== -1) {
      finalSuppressedIndices.add(minIndex);
    }
  }

  // 3. Format result with privacy-preserving display values & zero raw PII
  return items.map((item, index) => {
    const isSuppressed = finalSuppressedIndices.has(index);
    return {
      district: item.district,
      onboardedMsmes: item.onboardedMsmes,
      activeJobs: item.activeJobs,
      totalHires: isSuppressed ? 0 : item.totalHires,
      suppressedHires: isSuppressed,
      displayHires: isSuppressed ? '<5' : String(item.totalHires),
    };
  });
}

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
          const rawItems: DistrictReportItem[] = data.map((row) => ({
            district: String(row.district),
            onboardedMsmes: Number(row.onboarded_msmes || 0),
            activeJobs: Number(row.active_jobs || 0),
            totalHires: Number(row.total_hires || 0),
          }));
          return applyStatisticalDisclosureControl(rawItems);
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

    const sortedReport = report.sort((a, b) => a.district.localeCompare(b.district));
    return applyStatisticalDisclosureControl(sortedReport);
  }
}
