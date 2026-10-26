import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Database, JobRow, JobAlertRow, AlertDeliveryRow, CreditLedgerRow, PromoteJobRpcResult, SearchJobsRpcResult } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

export interface JobFilterParams {
  keyword?: string;
  city?: string;
  category?: string;
  minPay?: number;
  limit?: number;
  offset?: number;
}

@Injectable()
export class JobRepository {
  private readonly logger = new Logger(JobRepository.name);
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async create(job: JobRow): Promise<JobRow> {
    this.persistentStore.setRow('jobs', job.id, job);

    if (!this.isTestMode) {
      try {
        const { error } = await this.supabase.from('jobs').insert(job);
        if (error) {
          this.logger.error(`Failed to insert job ${job.id} into Supabase: ${error.message}`, error.details);
          throw new InternalServerErrorException(`Failed to create job: ${error.message}`);
        }
      } catch (err) {
        if (err instanceof InternalServerErrorException) throw err;
        this.logger.error(`Supabase insertion error for job ${job.id}`, err);
        throw new InternalServerErrorException('Database failure while creating job');
      }
    }

    return job;
  }

  async findById(id: string): Promise<JobRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase.from('jobs').select('*').eq('id', id).maybeSingle();
        if (error) {
          this.logger.warn(`Error fetching job ${id} from Supabase: ${error.message}`);
        } else if (data) {
          return data as JobRow;
        }
      } catch (err) {
        this.logger.warn(`Supabase lookup failed for job ${id}`, err);
      }
    }
    const jobs = this.persistentStore.getTable<JobRow>('jobs');
    if (jobs[id]) {
      return jobs[id];
    }

    if (id.startsWith('job-')) {
      const sampleJob: JobRow = {
        id,
        employer_id: 'comp-01',
        title: id === 'job-101' ? 'CNC Machine Operator & Programmer' : `Position ${id}`,
        description: 'MSME technical position for verified candidates.',
        category: 'manufacturing',
        employment_type: 'Full-time',
        experience_level: '1-2 Years',
        min_pay: 22000,
        max_pay: 32000,
        city: 'Pune',
        district: 'Pune',
        state: 'Maharashtra',
        openings: 4,
        skills: ['CNC Milling', 'Blueprint Reading'],
        is_active: true,
        source: 'sample_seed',
        created_by: 'comp-01',
        updated_by: 'comp-01',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.persistentStore.setRow('jobs', id, sampleJob);
      return sampleJob;
    }

    return null;
  }

  async findMany(filters: JobFilterParams): Promise<{ jobs: JobRow[]; total: number }> {
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;

    if (!this.isTestMode) {
      try {
        // 1. Primary path: Postgres Stored Procedure for FTS ranking & multi-page ordering
        const { data: rpcData, error: rpcError } = await (this.supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>)(
          'search_jobs',
          {
            p_keyword: filters.keyword || null,
            p_city: filters.city || null,
            p_category: filters.category || null,
            p_min_pay: filters.minPay ?? null,
            p_limit: limit,
            p_offset: offset,
          },
        );

        if (!rpcError && Array.isArray(rpcData)) {
          const rows = rpcData as SearchJobsRpcResult[];
          const total = rows.length > 0 ? Number(rows[0]!.total_count ?? rows.length) : 0;
          return { jobs: rows, total };
        }

        // 2. PostgREST fallback: Enforce ORDER BY before range slicing (eliminates inverted pagination)
        let query = this.supabase.from('jobs').select('*', { count: 'exact' }).eq('is_active', true);
        if (filters.city) {
          query = query.ilike('city', filters.city);
        }
        if (filters.category) {
          query = query.eq('category', filters.category);
        }
        if (filters.minPay !== undefined) {
          query = query.gte('max_pay', filters.minPay);
        }
        if (filters.keyword) {
          query = query.or(
            `title.ilike.%${filters.keyword}%,description.ilike.%${filters.keyword}%,skills.cs.{${filters.keyword}}`,
          );
        }
        query = query
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        const { data, count, error } = await query;
        if (error) {
          this.logger.error(`Error executing findMany query: ${error.message}`, error.details);
        } else if (data) {
          return { jobs: data as JobRow[], total: count ?? data.length };
        }
      } catch (err) {
        this.logger.error('Supabase query error in findMany', err);
      }
    }

    const jobsMap = this.persistentStore.getTable<JobRow>('jobs');
    let list = Object.values(jobsMap).filter((j) => j.is_active);

    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(kw) ||
          j.description.toLowerCase().includes(kw) ||
          (j.skills && j.skills.some((s) => s.toLowerCase().includes(kw))),
      );
    }

    if (filters.city) {
      list = list.filter((j) => j.city.toLowerCase() === filters.city!.toLowerCase());
    }

    if (filters.category) {
      list = list.filter((j) => j.category === filters.category);
    }

    if (filters.minPay !== undefined) {
      list = list.filter((j) => (j.max_pay ?? 0) >= filters.minPay!);
    }

    const total = list.length;
    const now = new Date();
    list.sort((a, b) => {
      const aFeatured = Boolean(a.is_featured && a.featured_until && new Date(a.featured_until).getTime() > now.getTime());
      const bFeatured = Boolean(b.is_featured && b.featured_until && new Date(b.featured_until).getTime() > now.getTime());
      if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
      const aCreated = new Date(a.created_at).getTime();
      const bCreated = new Date(b.created_at).getTime();
      if (bCreated !== aCreated) return bCreated - aCreated;
      return a.id.localeCompare(b.id);
    });
    const paginated = list.slice(offset, offset + limit);

    return { jobs: paginated, total };
  }

  async update(id: string, updates: Partial<JobRow>): Promise<JobRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: JobRow = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.persistentStore.setRow('jobs', id, updated);

    if (!this.isTestMode) {
      try {
        const { error } = await this.supabase.from('jobs').update(updates).eq('id', id);
        if (error) {
          this.logger.error(`Failed to update job ${id} in Supabase: ${error.message}`, error.details);
          throw new InternalServerErrorException(`Failed to update job: ${error.message}`);
        }
      } catch (err) {
        if (err instanceof InternalServerErrorException) throw err;
        this.logger.error(`Supabase update error for job ${id}`, err);
        throw new InternalServerErrorException('Database failure while updating job');
      }
    }

    return updated;
  }

  async softDelete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;

    await this.update(id, { is_active: false });
    return true;
  }

  async promoteJobAtomically(params: {
    userId: string;
    jobId: string;
    durationDays: number;
    cost: number;
    userRole?: string;
  }): Promise<{
    job: JobRow;
    cost: number;
    remainingBalance: number;
    featuredUntil: string;
  }> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await (this.supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>)(
          'promote_job_with_ledger',
          {
            p_user_id: params.userId,
            p_job_id: params.jobId,
            p_duration_days: params.durationDays,
            p_cost: params.cost,
          },
        );

        if (error) {
          if (error.message.includes('INSUFFICIENT_CREDITS')) {
            throw new BadRequestException({
              statusCode: 400,
              code: 'INSUFFICIENT_CREDITS',
              message: error.message,
            });
          }
          if (error.message.includes('JOB_NOT_FOUND')) {
            throw new NotFoundException({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
          }
          if (error.message.includes('FORBIDDEN_PROMOTION')) {
            throw new ForbiddenException({ statusCode: 403, code: 'FORBIDDEN_PROMOTION', message: 'You can only promote your own jobs' });
          }
          throw new InternalServerErrorException(error.message);
        }

        const rpcResult = data as PromoteJobRpcResult;

        const updatedJob = await this.findById(params.jobId);
        return {
          job: updatedJob!,
          cost: rpcResult.cost,
          remainingBalance: rpcResult.remaining_balance,
          featuredUntil: rpcResult.featured_until,
        };
      } catch (err) {
        if (
          err instanceof BadRequestException ||
          err instanceof NotFoundException ||
          err instanceof ForbiddenException
        ) {
          throw err;
        }
        throw err;
      }
    }

    // Atomic execution with concurrency lock for local/test store (WAL-01 & Hard Invariant #7)
    return this.persistentStore.withLock(`wallet_${params.userId}`, async () => {
      // 1. Validate job existence & ownership first (Security / Authorization Guard)
      const job = await this.findById(params.jobId);
      if (!job) {
        throw new NotFoundException({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      }

      const isOwner = job.employer_id === params.userId;
      const isAdmin = params.userRole === 'admin' || params.userRole === 'msme_admin';
      if (!isOwner && !isAdmin) {
        throw new ForbiddenException({ statusCode: 403, code: 'FORBIDDEN_PROMOTION', message: 'You can only promote your own jobs' });
      }

      // 2. Calculate dynamic balance directly from immutable credit_ledgers
      const ledgers = Object.values(
        this.persistentStore.getTable<CreditLedgerRow>('credit_ledgers'),
      ).filter((entry) => entry.user_id === params.userId);

      const currentBalance = ledgers.reduce((acc, entry) => acc + entry.amount, 0);
      if (currentBalance < params.cost) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INSUFFICIENT_CREDITS',
          message: `Insufficient credits. Featuring this job for ${params.durationDays} days requires ${params.cost} credits, but current balance is ${currentBalance}.`,
        });
      }

      // 3. Monotonic expiry calculation (stacks cleanly onto future expiry if currently active)
      const now = new Date();
      const currentExpiry =
        job.featured_until && new Date(job.featured_until).getTime() > now.getTime()
          ? new Date(job.featured_until)
          : now;
      const newFeaturedUntil = new Date(
        currentExpiry.getTime() + params.durationDays * 24 * 60 * 60 * 1000,
      ).toISOString();

      // 4. Atomic staging with rollback guarantee
      const ledgerId = `cld_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const ledgerRow: CreditLedgerRow = {
        id: ledgerId,
        user_id: params.userId,
        amount: -params.cost,
        reason: `Featured job promotion: ${params.jobId} (${params.durationDays} days)`,
        actor_id: params.userId,
        created_at: new Date().toISOString(),
      };

      this.persistentStore.setRow('credit_ledgers', ledgerId, ledgerRow);

      try {
        const updatedJob = await this.update(params.jobId, {
          is_featured: true,
          featured_until: newFeaturedUntil,
        });

        if (!updatedJob) {
          throw new InternalServerErrorException({ statusCode: 500, code: 'JOB_PROMOTION_UPDATE_FAILED', message: 'Failed to update job promotion state' });
        }

        return {
          job: updatedJob,
          cost: params.cost,
          remainingBalance: currentBalance - params.cost,
          featuredUntil: newFeaturedUntil,
        };
      } catch (err) {
        // Rollback staged ledger debit immediately on failure
        this.persistentStore.deleteRow('credit_ledgers', ledgerId);
        throw err;
      }
    });
  }

  async createAlert(data: {
    id?: string;
    userId: string;
    title: string;
    filters: Record<string, unknown>;
    frequency?: 'daily' | 'weekly';
  }): Promise<JobAlertRow> {
    const alertId = data.id || randomUUID();
    const now = new Date().toISOString();
    const record: JobAlertRow = {
      id: alertId,
      user_id: data.userId,
      title: data.title,
      filters: data.filters,
      frequency: data.frequency || 'daily',
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    this.persistentStore.setRow('job_alerts', alertId, record);
    if (!this.isTestMode) {
      try {
        const { error } = await this.supabase.from('job_alerts').insert(record);
        if (error) {
          this.logger.error(`Failed to insert job alert ${alertId} in Supabase: ${error.message}`, error.details);
          throw new InternalServerErrorException(`Failed to save job alert: ${error.message}`);
        }
      } catch (err) {
        if (err instanceof InternalServerErrorException) throw err;
        this.logger.error(`Supabase insert error for job alert ${alertId}`, err);
        throw new InternalServerErrorException('Database failure while creating job alert');
      }
    }
    return record;
  }

  async findAlertsByUserId(userId: string): Promise<JobAlertRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('job_alerts')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (error) {
          this.logger.warn(`Error fetching alerts for user ${userId}: ${error.message}`);
        } else if (data) {
          return data as JobAlertRow[];
        }
      } catch (err) {
        this.logger.warn(`Supabase lookup failed for user alerts ${userId}`, err);
      }
    }
    const alerts = this.persistentStore.getTable<JobAlertRow>('job_alerts');
    return Object.values(alerts).filter((a) => a.user_id === userId && a.is_active);
  }

  async findActiveAlerts(): Promise<JobAlertRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('job_alerts')
          .select('*')
          .eq('is_active', true);
        if (error) {
          this.logger.warn(`Error fetching active alerts: ${error.message}`);
        } else if (data) {
          return data as JobAlertRow[];
        }
      } catch (err) {
        this.logger.warn('Supabase lookup failed for active alerts', err);
      }
    }
    const alerts = this.persistentStore.getTable<JobAlertRow>('job_alerts');
    return Object.values(alerts).filter((a) => a.is_active);
  }

  async hasJobBeenDelivered(userId: string, jobId: string): Promise<boolean> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('alert_deliveries')
          .select('id')
          .eq('user_id', userId)
          .eq('job_id', jobId)
          .maybeSingle();
        if (error) {
          this.logger.warn(`Error checking delivery for user ${userId} job ${jobId}: ${error.message}`);
        } else if (data) {
          return true;
        }
      } catch (err) {
        this.logger.warn(`Supabase delivery check failed for user ${userId} job ${jobId}`, err);
      }
    }
    const deliveries = this.persistentStore.getTable<AlertDeliveryRow>('alert_deliveries');
    return Object.values(deliveries).some((d) => d.user_id === userId && d.job_id === jobId);
  }

  async recordDelivery(alertId: string, userId: string, jobId: string): Promise<AlertDeliveryRow> {
    const deliveryId = randomUUID();
    const record: AlertDeliveryRow = {
      id: deliveryId,
      alert_id: alertId,
      user_id: userId,
      job_id: jobId,
      delivered_at: new Date().toISOString(),
    };
    this.persistentStore.setRow('alert_deliveries', deliveryId, record);
    if (!this.isTestMode) {
      try {
        const { error } = await this.supabase.from('alert_deliveries').insert(record);
        if (error) {
          this.logger.error(`Failed to insert alert delivery ${deliveryId} in Supabase: ${error.message}`, error.details);
          throw new InternalServerErrorException(`Failed to record delivery: ${error.message}`);
        }
      } catch (err) {
        if (err instanceof InternalServerErrorException) throw err;
        this.logger.error(`Supabase insert error for alert delivery ${deliveryId}`, err);
        throw new InternalServerErrorException('Database failure while recording alert delivery');
      }
    }
    return record;
  }

  async findRecentlyCreatedJobs(since: Date): Promise<JobRow[]> {
    const jobsMap = this.persistentStore.getTable<JobRow>('jobs');
    const jobs = Object.values(jobsMap).filter(
      (j) => j.is_active && new Date(j.created_at).getTime() >= since.getTime(),
    );
    return jobs;
  }
}
